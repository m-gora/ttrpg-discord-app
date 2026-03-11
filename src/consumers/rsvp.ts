/**
 * Consumer for `rsvp.attend.requested` and `rsvp.decline.requested` events.
 *
 * Processes the RSVP by:
 *   1. Updating the session in storage (add/remove from rsvps/declined)
 *   2. Editing the session card message in the channel
 *   3. Triggering a reschedule poll on first decline (if applicable)
 *   4. Publishing the downstream rsvp.attended / rsvp.declined event
 */

import { REST, type Client } from "discord.js";
import { type Session, getSessions, updateSession } from "../sessions";
import { buildSessionCard } from "../session-card";
import { openReschedulePoll } from "../reschedule-poll";
import { Subjects } from "../messaging/events";
import type {
  RsvpAttendRequestedEvent,
  RsvpDeclineRequestedEvent,
  RsvpAttendedEvent,
  RsvpDeclinedEvent,
} from "../messaging/events";
import type { MessagingPort, EventEnvelope } from "../messaging/port";

const ATTEND_CONSUMER = "rsvp-attend-handler";
const DECLINE_CONSUMER = "rsvp-decline-handler";

export async function startRsvpConsumers(
  messaging: MessagingPort,
  client: Client,
): Promise<void> {
  // ── Attend ──────────────────────────────────────────────

  await messaging.subscribe<RsvpAttendRequestedEvent>(
    Subjects.RSVP_ATTEND_REQUESTED,
    ATTEND_CONSUMER,
    async (envelope: EventEnvelope<RsvpAttendRequestedEvent>) => {
      const { sessionId, userId, channelId, interactionToken, applicationId } =
        envelope.data;

      const sessions = await getSessions();
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) {
        console.warn(`[consumer] Session ${sessionId} not found for RSVP attend`);
        return;
      }

      if (!Array.isArray(session.declined)) session.declined = [];

      // Idempotency: skip if already attending
      if (!session.rsvps.includes(userId)) {
        session.declined = session.declined.filter((id) => id !== userId);
        session.rsvps.push(userId);
        await updateSession(session);
      }

      await updateSessionCard(client, session, channelId, applicationId, interactionToken);

      await messaging.publish<RsvpAttendedEvent>(Subjects.RSVP_ATTENDED, {
        sessionId: session.id,
        userId,
        totalAttending: session.rsvps.length,
      });

      console.log(`[consumer] RSVP attend: user ${userId} → session ${sessionId}`);
    },
  );

  console.log(`[consumer] ${ATTEND_CONSUMER} subscribed to ${Subjects.RSVP_ATTEND_REQUESTED}`);

  // ── Decline ─────────────────────────────────────────────

  await messaging.subscribe<RsvpDeclineRequestedEvent>(
    Subjects.RSVP_DECLINE_REQUESTED,
    DECLINE_CONSUMER,
    async (envelope: EventEnvelope<RsvpDeclineRequestedEvent>) => {
      const {
        sessionId,
        userId,
        userDisplayName,
        channelId,
        interactionToken,
        applicationId,
      } = envelope.data;

      const sessions = await getSessions();
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) {
        console.warn(`[consumer] Session ${sessionId} not found for RSVP decline`);
        return;
      }

      if (!Array.isArray(session.declined)) session.declined = [];

      // Idempotency: skip if already declined
      if (!session.declined.includes(userId)) {
        session.rsvps = session.rsvps.filter((id) => id !== userId);
        session.declined.push(userId);
        await updateSession(session);

        // Trigger reschedule poll on first decline
        if (!session.rescheduleActive) {
          const channel = await client.channels.fetch(channelId);
          if (channel?.isSendable()) {
            await openReschedulePoll(channel, session, userDisplayName, messaging);
          }
        }
      }

      await updateSessionCard(client, session, channelId, applicationId, interactionToken);

      await messaging.publish<RsvpDeclinedEvent>(Subjects.RSVP_DECLINED, {
        sessionId: session.id,
        userId,
        totalDeclined: session.declined.length,
      });

      console.log(`[consumer] RSVP decline: user ${userId} → session ${sessionId}`);
    },
  );

  console.log(`[consumer] ${DECLINE_CONSUMER} subscribed to ${Subjects.RSVP_DECLINE_REQUESTED}`);
}

/**
 * Update the session card embed via the deferred component interaction webhook,
 * which edits the original message the button belongs to.
 */
async function updateSessionCard(
  _client: Client,
  session: Session,
  _channelId: string,
  applicationId: string,
  interactionToken: string,
): Promise<void> {
  const { embed, row } = buildSessionCard(session);

  // Edit the original message via the component interaction webhook
  const rest = new REST({ version: "10" });
  const url = `/webhooks/${applicationId}/${interactionToken}/messages/@original` as const;
  await rest.patch(url, {
    body: { embeds: [embed.toJSON()], components: [row.toJSON()] },
    auth: false,
  });
}
