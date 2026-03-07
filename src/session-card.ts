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

/** Custom ID prefix used for the Attend button */
export const ATTEND_BUTTON_PREFIX = "attend_";
/** Custom ID prefix used for the Decline button */
export const DECLINE_BUTTON_PREFIX = "decline_";

/**
 * Build the session card embed and Attend / Don't Attend action row.
 * `memberCount` is the total number of (non-bot) members in the channel.
 */
export function buildSessionCard(
  session: Session,
  memberCount: number,
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const d = new Date(session.date);
  const attendCount = session.rsvps.length;
  const declinedCount = (session.declined ?? []).length;

  const attendList =
    attendCount > 0
      ? session.rsvps.map((uid) => `<@${uid}>`).join(", ")
      : "*No one yet*";

  const declinedList =
    declinedCount > 0
      ? (session.declined ?? []).map((uid) => `<@${uid}>`).join(", ")
      : "*—*";

  const fields = [
      {
        name: "📅 Date",
        value: `${time(d, "F")} (${time(d, "R")})`,
      },
      {
        name: `✅ Attending — ${attendCount}/${memberCount}`,
        value: attendList,
      },
      {
        name: `❌ Can't Make It — ${declinedCount}`,
        value: declinedList,
      },
    ];

  if (session.vttLink) {
    fields.push({ name: "🗺️ VTT", value: session.vttLink });
  }

  fields.push({ name: "ID", value: `\`${session.id}\``, inline: true } as any);

  const embed = new EmbedBuilder()
    .setTitle(`🎲 ${session.title}`)
    .setColor(0x5865f2)
    .addFields(...fields)
    .setFooter({ text: `Created by` })
    .setTimestamp(d);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ATTEND_BUTTON_PREFIX}${session.id}`)
      .setLabel(`Attend (${attendCount})`)
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId(`${DECLINE_BUTTON_PREFIX}${session.id}`)
      .setLabel(`Can't Make It (${declinedCount})`)
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌"),
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

  // Group DM – recipients is a Collection of PartialRecipient (excludes the client user)
  if (channel.type === ChannelType.GroupDM && "recipients" in channel) {
    const recipients = (channel as unknown as { recipients: { size: number } }).recipients;
    // +1 because the collection excludes the current (client) user
    return (recipients?.size ?? 0) + 1;
  }

  // Regular DM – just the other person
  if (channel.type === ChannelType.DM) {
    return 2;
  }

  return 1;
}
