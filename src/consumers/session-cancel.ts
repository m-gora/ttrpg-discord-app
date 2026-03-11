/**
 * Consumer for `session.cancel.requested` events.
 *
 * Removes the session from storage, decrements the campaign session counter
 * if applicable, edits the deferred Discord reply, and publishes the
 * downstream `session.cancelled` event.
 */

import { REST } from "discord.js";
import { getUpcomingSessions, removeSession } from "../sessions";
import { decrementSessionCounter } from "../campaigns";
import { Subjects } from "../messaging/events";
import type {
  SessionCancelRequestedEvent,
  SessionCancelledEvent,
} from "../messaging/events";
import type { MessagingPort, EventEnvelope } from "../messaging/port";

const CONSUMER_NAME = "session-cancel-handler";

export async function startSessionCancelConsumer(messaging: MessagingPort): Promise<void> {
  await messaging.subscribe<SessionCancelRequestedEvent>(
    Subjects.SESSION_CANCEL_REQUESTED,
    CONSUMER_NAME,
    async (envelope: EventEnvelope<SessionCancelRequestedEvent>) => {
      const { sessionId, guildId, cancelledBy, interactionToken, applicationId } =
        envelope.data;

      const sessions = await getUpcomingSessions(guildId);
      const session = sessions.find((s) => s.id === sessionId);

      if (!session) {
        // Session was already removed — ack and move on
        console.warn(`[consumer] Session ${sessionId} not found — already cancelled?`);
        await editDeferredReply(applicationId, interactionToken, {
          content: "❌ Session not found (it may have been cancelled already).",
        });
        return;
      }

      if (session.campaignId) {
        await decrementSessionCounter(session.campaignId);
      }

      await removeSession(sessionId);

      await editDeferredReply(applicationId, interactionToken, {
        content: `🗑️ Session **${session.title}** has been cancelled.`,
      });

      await messaging.publish<SessionCancelledEvent>(Subjects.SESSION_CANCELLED, {
        sessionId,
        cancelledBy,
        title: session.title,
        campaignId: session.campaignId,
      });

      console.log(`[consumer] Session cancelled: ${session.title} (${sessionId})`);
    },
  );

  console.log(`[consumer] ${CONSUMER_NAME} subscribed to ${Subjects.SESSION_CANCEL_REQUESTED}`);
}

async function editDeferredReply(
  applicationId: string,
  interactionToken: string,
  body: Record<string, unknown>,
): Promise<void> {
  const rest = new REST({ version: "10" });
  const url = `/webhooks/${applicationId}/${interactionToken}/messages/@original` as const;
  await rest.patch(url, { body, auth: false });
}
