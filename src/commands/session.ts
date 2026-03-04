import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  time,
} from "discord.js";
import { randomUUID } from "node:crypto";
import {
  addSession,
  getUpcomingSessions,
  removeSession,
} from "../sessions";
import { buildSessionCard, countChannelMembers } from "../session-card";

export const data = new SlashCommandBuilder()
  .setName("session")
  .setDescription("Manage TTRPG session events")
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Schedule a new session")
      .addStringOption((opt) =>
        opt
          .setName("title")
          .setDescription('Session title, e.g. "Curse of Strahd – Session 12"')
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("date")
          .setDescription("Date & time in YYYY-MM-DD HH:mm format (24h, your local time)")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("timezone")
          .setDescription("IANA timezone, e.g. Europe/Rome (default: UTC)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("Show upcoming sessions"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("cancel")
      .setDescription("Cancel an upcoming session")
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setDescription("Session ID (use /session list to find it)")
          .setRequired(true),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "create") {
    await handleCreate(interaction);
  } else if (sub === "list") {
    await handleList(interaction);
  } else if (sub === "cancel") {
    await handleCancel(interaction);
  }
}

// ── Create ────────────────────────────────────────────────

async function handleCreate(interaction: ChatInputCommandInteraction) {
  const title = interaction.options.getString("title", true);
  const dateStr = interaction.options.getString("date", true);
  const tz = interaction.options.getString("timezone") ?? "UTC";

  // Parse the user-supplied date in the given timezone
  const parsed = parseDateInTZ(dateStr, tz);
  if (!parsed || Number.isNaN(parsed.getTime())) {
    await interaction.reply({
      content:
        "❌ Invalid date. Please use the format `YYYY-MM-DD HH:mm` and a valid IANA timezone.",
      ephemeral: true,
    });
    return;
  }

  if (parsed.getTime() < Date.now()) {
    await interaction.reply({
      content: "❌ That date is in the past!",
      ephemeral: true,
    });
    return;
  }

  const id = randomUUID().slice(0, 8);

  const channel = interaction.channel;
  if (!channel) {
    await interaction.reply({
      content: "\u274c Could not resolve the channel.",
      ephemeral: true,
    });
    return;
  }

  const session = {
    id,
    guildId: interaction.guildId ?? "",
    channelId: interaction.channelId,
    title,
    date: parsed.toISOString(),
    createdBy: interaction.user.id,
    messageId: "", // will be set after sending
    rsvps: [] as string[],
    reminded24h: false,
    remindedStart: false,
  };

  // Count non-bot members who can see this channel
  const memberCount = await countChannelMembers(channel);

  const { embed, row } = buildSessionCard(session, memberCount);
  embed.setFooter({ text: `Created by ${interaction.user.displayName}` });

  // Reply with the card in the channel (visible to everyone)
  await interaction.reply({ embeds: [embed], components: [row] });
  const reply = await interaction.fetchReply();

  // Store the message ID so we can edit the card later on RSVP
  session.messageId = reply.id;
  await addSession(session);
}

// ── List ──────────────────────────────────────────────────

async function handleList(interaction: ChatInputCommandInteraction) {
  const sessions = await getUpcomingSessions(interaction.guildId ?? "");

  if (sessions.length === 0) {
    await interaction.reply({
      content: "📭 No upcoming sessions. Use `/session create` to schedule one!",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("📅 Upcoming Sessions")
    .setColor(0x57f287)
    .setDescription(
      sessions
        .map((s) => {
          const d = new Date(s.date);
          const rsvpCount = s.rsvps?.length ?? 0;
          return `**${s.title}**\n${time(d, "F")} (${time(d, "R")})\n✅ ${rsvpCount} RSVPd | ID: \`${s.id}\``;
        })
        .join("\n\n"),
    );

  await interaction.reply({ embeds: [embed] });
}

// ── Cancel ────────────────────────────────────────────────

async function handleCancel(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getString("id", true);
  const sessions = await getUpcomingSessions(interaction.guildId ?? "");
  const session = sessions.find((s) => s.id === id);

  if (!session) {
    await interaction.reply({
      content: "❌ Session not found. Use `/session list` to see upcoming sessions.",
      ephemeral: true,
    });
    return;
  }

  await removeSession(id);
  await interaction.reply(`🗑️ Session **${session.title}** has been cancelled.`);
}

// ── Helpers ───────────────────────────────────────────────

/**
 * Parse a "YYYY-MM-DD HH:mm" string interpreted in the given IANA timezone
 * and return a UTC Date object.
 */
function parseDateInTZ(input: string, tz: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.exec(input.trim());
  if (!match) return null;

  // Build an ISO string and use Intl to figure out the offset
  const [, year, month, day, hour, minute] = match;
  const naive = `${year}-${month}-${day}T${hour}:${minute}:00`;

  try {
    // Create a formatter that will tell us what the wall-clock time is in the target TZ
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    // Binary-search style: start from a rough UTC guess and adjust
    let guess = new Date(naive + "Z");
    for (let i = 0; i < 3; i++) {
      const parts = formatter.formatToParts(guess);
      const get = (type: string) =>
        parts.find((p) => p.type === type)?.value ?? "0";
      const wallStr = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`;
      const wall = new Date(wallStr);
      const diff = wall.getTime() - guess.getTime(); // offset in ms
      guess = new Date(new Date(naive + "Z").getTime() - diff);
    }

    return guess;
  } catch {
    return null;
  }
}
