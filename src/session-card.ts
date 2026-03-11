import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  time,
} from "discord.js";
import type { Session } from "./sessions";

/** Custom ID prefix used for the Attend button */
export const ATTEND_BUTTON_PREFIX = "attend_";
/** Custom ID prefix used for the Decline button */
export const DECLINE_BUTTON_PREFIX = "decline_";

/**
 * Build the session card embed and Attend / Don't Attend action row.
 */
export function buildSessionCard(
  session: Session,
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const d = new Date(session.date);
  const attendCount = session.rsvps.length;
  const declinedCount = (session.declined ?? []).length;
  const total = session.playerCount;

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
        name: `✅ Attending — ${attendCount}/${total}`,
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
