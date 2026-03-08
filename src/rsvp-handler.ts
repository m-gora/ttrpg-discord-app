import { type ButtonInteraction, MessageFlags } from "discord.js";
import { type Session, getSessions, updateSession } from "./sessions";
import {
  ATTEND_BUTTON_PREFIX,
  DECLINE_BUTTON_PREFIX,
  buildSessionCard,
  countChannelMembers,
} from "./session-card";
import { openReschedulePoll } from "./reschedule-poll";
import type { MessagingPort } from "./messaging/port";
import { Subjects } from "./messaging/events";
import type { RsvpAttendedEvent, RsvpDeclinedEvent } from "./messaging/events";

/**
 * Handle Attend / Don't Attend button clicks.
 * - "Attend" adds the user to rsvps (removes from declined if present).
 * - "Don't Attend" adds the user to declined (removes from rsvps if present)
 *   and triggers a reschedule poll on the first cancellation.
 */
export async function handleRsvpButton(
  interaction: ButtonInteraction,
  messaging?: MessagingPort,
): Promise<void> {
  const customId = interaction.customId;

  const isAttend = customId.startsWith(ATTEND_BUTTON_PREFIX);
  const isDecline = customId.startsWith(DECLINE_BUTTON_PREFIX);
  if (!isAttend && !isDecline) return;

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

  if (isAttend) {
    const earlyReply = handleAttend(session, userId);
    if (earlyReply) {
      await interaction.reply({ content: earlyReply, flags: MessageFlags.Ephemeral });
      return;
    }
    await messaging?.publish<RsvpAttendedEvent>(Subjects.RSVP_ATTENDED, {
      sessionId: session.id,
      userId,
      totalAttending: session.rsvps.length,
    });
  } else {
    const earlyReply = await handleDecline(session, userId, interaction, messaging);
    if (earlyReply) {
      await interaction.reply({ content: earlyReply, flags: MessageFlags.Ephemeral });
      return;
    }
    await messaging?.publish<RsvpDeclinedEvent>(Subjects.RSVP_DECLINED, {
      sessionId: session.id,
      userId,
      totalDeclined: session.declined.length,
    });
  }

  await updateSession(session);

  // Rebuild the embed with updated info
  const channel = interaction.channel;
  if (!channel) {
    await interaction.reply({
      content: isAttend ? "✅ You're attending!" : "❌ Marked as can't make it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const memberCount = await countChannelMembers(channel);
  const { embed, row } = buildSessionCard(session, memberCount);
  await interaction.update({ embeds: [embed], components: [row] });
}

/** Returns an ephemeral reply string if the user is already attending, or null to continue. */
function handleAttend(session: Session, userId: string): string | null {
  if (session.rsvps.includes(userId)) {
    return "You're already marked as attending!";
  }
  session.declined = session.declined.filter((id) => id !== userId);
  session.rsvps.push(userId);
  return null;
}

/** Returns an ephemeral reply string if the user already declined, or null to continue. */
async function handleDecline(
  session: Session,
  userId: string,
  interaction: ButtonInteraction,
  messaging?: MessagingPort,
): Promise<string | null> {
  if (session.declined.includes(userId)) {
    return "You've already indicated you can't make it.";
  }

  session.rsvps = session.rsvps.filter((id) => id !== userId);
  session.declined.push(userId);

  // Save so the reschedule poll sees updated state
  await updateSession(session);

  // Trigger reschedule poll on the first cancellation
  if (!session.rescheduleActive && interaction.channelId) {
    const channel = await interaction.client.channels.fetch(interaction.channelId);
    if (channel?.isSendable()) {
      await openReschedulePoll(
        channel,
        session,
        interaction.user.displayName,
        messaging,
      );
    }
  }

  return null;
}
