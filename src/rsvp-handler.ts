import { type ButtonInteraction, MessageFlags } from "discord.js";
import { getSessions } from "./sessions";
import {
  ATTEND_BUTTON_PREFIX,
  DECLINE_BUTTON_PREFIX,
} from "./session-card";
import type { MessagingPort } from "./messaging/port";
import { Subjects } from "./messaging/events";
import type { RsvpAttendRequestedEvent, RsvpDeclineRequestedEvent } from "./messaging/events";

/**
 * Handle Attend / Don't Attend button clicks.
 * Validates the session exists, defers the button update, and publishes
 * a command event for the consumer to process.
 */
export async function handleRsvpButton(
  interaction: ButtonInteraction,
  messaging?: MessagingPort,
): Promise<void> {
  const customId = interaction.customId;

  const isAttend = customId.startsWith(ATTEND_BUTTON_PREFIX);
  const isDecline = customId.startsWith(DECLINE_BUTTON_PREFIX);
  if (!isAttend && !isDecline) return;

  if (!messaging) {
    await interaction.reply({
      content: "❌ Messaging is not configured — RSVPs require NATS.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const prefix = isAttend ? ATTEND_BUTTON_PREFIX : DECLINE_BUTTON_PREFIX;
  const sessionId = customId.slice(prefix.length);
  const sessions = await getSessions();
  const session = sessions.find((s) => s.id === sessionId);

  if (!session) {
    await interaction.reply({
      content: "❌ This session no longer exists.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Ensure the declined array exists (backward compat with old data)
  if (!Array.isArray(session.declined)) session.declined = [];

  const userId = interaction.user.id;

  // Early-out for duplicate actions
  if (isAttend && session.rsvps.includes(userId)) {
    await interaction.reply({ content: "You're already marked as attending!", flags: MessageFlags.Ephemeral });
    return;
  }
  if (isDecline && session.declined.includes(userId)) {
    await interaction.reply({ content: "You've already indicated you can't make it.", flags: MessageFlags.Ephemeral });
    return;
  }

  // Defer the component update — the consumer will edit the card
  await interaction.deferUpdate();

  if (isAttend) {
    await messaging.publish<RsvpAttendRequestedEvent>(
      Subjects.RSVP_ATTEND_REQUESTED,
      {
        sessionId: session.id,
        userId,
        channelId: interaction.channelId,
        sessionMessageId: session.messageId,
        interactionToken: interaction.token,
        applicationId: interaction.applicationId,
      },
    );
  } else {
    await messaging.publish<RsvpDeclineRequestedEvent>(
      Subjects.RSVP_DECLINE_REQUESTED,
      {
        sessionId: session.id,
        userId,
        userDisplayName: interaction.user.displayName,
        channelId: interaction.channelId,
        sessionMessageId: session.messageId,
        interactionToken: interaction.token,
        applicationId: interaction.applicationId,
      },
    );
  }
}
