/**
 * Consumer for `session.create.requested` events.
 *
 * Processes the command by:
 *   1. Building the session card embed
 *   2. Editing the deferred Discord interaction reply via the webhook API
 *   3. Persisting the session to storage
 *   4. Publishing the downstream `session.created` event
 */

import { REST } from "discord.js";
import { addSession } from "../sessions";
import { buildSessionCard } from "../session-card";
import { Subjects } from "../messaging/events";
import type {
  SessionCreateRequestedEvent,
  SessionCreatedEvent,
} from "../messaging/events";
import type { MessagingPort, EventEnvelope } from "../messaging/port";

const CONSUMER_NAME = "session-create-handler";

export async function startSessionCreateConsumer(messaging: MessagingPort): Promise<void> {
  await messaging.subscribe<SessionCreateRequestedEvent>(
    Subjects.SESSION_CREATE_REQUESTED,
    CONSUMER_NAME,
    async (envelope: EventEnvelope<SessionCreateRequestedEvent>) => {
      const {
        session,
        createdByDisplayName,
        interactionToken,
        applicationId,
      } = envelope.data;

      const { embed, row } = buildSessionCard(session);
      embed.setFooter({ text: `Created by ${createdByDisplayName}` });

      // Edit the deferred interaction reply via Discord's webhook API
      const rest = new REST({ version: "10" });
      // No token needed — interaction webhook endpoints don't require bot auth
      const webhookUrl = `/webhooks/${applicationId}/${interactionToken}/messages/@original` as const;

      const body = {
        embeds: [embed.toJSON()],
        components: [row.toJSON()],
      };

      const response = await rest.patch(webhookUrl, { body, auth: false }) as { id: string };

      // Persist the session with the Discord message ID
      const persisted = { ...session, messageId: response.id };
      await addSession(persisted);

      // Publish the downstream notification event
      await messaging.publish<SessionCreatedEvent>(Subjects.SESSION_CREATED, {
        session: persisted,
      });

      console.log(`[consumer] Session created: ${session.title} (${session.id})`);
    },
  );

  console.log(`[consumer] ${CONSUMER_NAME} subscribed to ${Subjects.SESSION_CREATE_REQUESTED}`);
}
