import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  time,
  TextChannel,
  ChannelType,
  type Channel,
} from "discord.js";
import type { Session } from "./sessions";

/** Custom ID prefix used for the RSVP button */
export const RSVP_BUTTON_PREFIX = "rsvp_";

/**
 * Build the session card embed and RSVP action row.
 * `memberCount` is the total number of (non-bot) members in the channel.
 */
export function buildSessionCard(
  session: Session,
  memberCount: number,
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const d = new Date(session.date);
  const rsvpCount = session.rsvps.length;

  const rsvpList =
    rsvpCount > 0
      ? session.rsvps.map((uid) => `<@${uid}>`).join(", ")
      : "*No RSVPs yet*";

  const embed = new EmbedBuilder()
    .setTitle(`🎲 ${session.title}`)
    .setColor(0x5865f2)
    .addFields(
      {
        name: "📅 Date",
        value: `${time(d, "F")} (${time(d, "R")})`,
      },
      {
        name: `✅ RSVP — ${rsvpCount}/${memberCount}`,
        value: rsvpList,
      },
      { name: "ID", value: `\`${session.id}\``, inline: true },
    )
    .setFooter({ text: `Created by` })
    .setTimestamp(d);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${RSVP_BUTTON_PREFIX}${session.id}`)
      .setLabel(
        rsvpCount > 0 ? `RSVP (${rsvpCount}/${memberCount})` : "RSVP",
      )
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎟️"),
  );

  return { embed, row };
}

/**
 * Count members in a channel, excluding bots.
 * Works for guild text channels, group DMs, and DMs.
 */
export async function countChannelMembers(
  channel: Channel,
): Promise<number> {
  // Guild text channel – fetch members and check permissions
  if (channel instanceof TextChannel) {
    const guild = channel.guild;
    await guild.members.fetch();
    return guild.members.cache.filter(
      (m) => !m.user.bot && channel.permissionsFor(m)?.has("ViewChannel"),
    ).size;
  }

  // Group DM – recipients is an array of PartialRecipient
  if (channel.type === ChannelType.GroupDM && "recipients" in channel) {
    const recipients = (channel as unknown as { recipients: unknown[] }).recipients;
    return Array.isArray(recipients) ? recipients.length : 1;
  }

  // Regular DM – just the other person
  if (channel.type === ChannelType.DM) {
    return 2;
  }

  return 1;
}
