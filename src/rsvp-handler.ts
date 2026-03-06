import { type ButtonInteraction, type SendableChannels } from "discord.js";
import { getSessions, updateSession } from "./sessions";
import {
  RSVP_BUTTON_PREFIX,
  buildSessionCard,
  countChannelMembers,
} from "./session-card";
import { openReschedulePoll } from "./reschedule-poll";

/**
 * Handle an RSVP button click: toggle the user's RSVP and update the card.
 * If someone un-RSVPs (declines), a reschedule poll is opened.
 */
export async function handleRsvpButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const customId = interaction.customId;
  if (!customId.startsWith(RSVP_BUTTON_PREFIX)) return;

  const sessionId = customId.slice(RSVP_BUTTON_PREFIX.length);
  const sessions = await getSessions();
  const session = sessions.find((s) => s.id === sessionId);

  if (!session) {
    await interaction.reply({
      content: "❌ This session no longer exists.",
      ephemeral: true,
    });
    return;
  }

  const userId = interaction.user.id;
  const alreadyRsvpd = session.rsvps.includes(userId);

  if (alreadyRsvpd) {
    session.rsvps = session.rsvps.filter((id) => id !== userId);
  } else {
    session.rsvps.push(userId);
  }

  await updateSession(session);

  // Rebuild the embed with updated RSVP info
  const channel = interaction.channel;
  if (!channel) {
    await interaction.reply({
      content: alreadyRsvpd
        ? "🔕 Your RSVP has been removed."
        : "🎟️ You've RSVPd!",
      ephemeral: true,
    });
    return;
  }

  const memberCount = await countChannelMembers(channel);
  const { embed, row } = buildSessionCard(session, memberCount);

  // Update the original message with the new embed
  await interaction.update({ embeds: [embed], components: [row] });

  // If someone declined (un-RSVPd), open a reschedule poll
  if (alreadyRsvpd && !session.rescheduleActive) {
    await openReschedulePoll(
      channel as SendableChannels,
      session,
      interaction.user.displayName,
    );
  }
}
