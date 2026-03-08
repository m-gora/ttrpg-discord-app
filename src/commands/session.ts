import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
  MessageFlags,
  time,
} from "discord.js";
import { randomUUID } from "node:crypto";
import {
  addSession,
  getUpcomingSessions,
  removeSession,
} from "../sessions";
import { buildSessionCard, countChannelMembers } from "../session-card";
import { getChannelCampaigns, nextSessionNumber, decrementSessionCounter } from "../campaigns";
import type { MessagingPort } from "../messaging/port";
import { Subjects } from "../messaging/events";
import type { SessionCreatedEvent, SessionCancelledEvent } from "../messaging/events";

export const data = new SlashCommandBuilder()
  .setName("session")
  .setDescription("Manage TTRPG session events")
  .setIntegrationTypes(
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall,
  )
  .setContexts(
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  )
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Schedule a new session")
      .addStringOption((opt) =>
        opt
          .setName("date")
          .setDescription("Date & time in YYYY-MM-DD HH:mm format (24h, your local time)")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("title")
          .setDescription("Session title (auto-generated if using a campaign)")
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName("timezone")
          .setDescription("IANA timezone, e.g. Europe/Rome (default: UTC)")
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName("campaign")
          .setDescription("Campaign ID — auto-names the session (use /campaign list)")
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

export async function execute(
  interaction: ChatInputCommandInteraction,
  messaging?: MessagingPort,
) {
  const sub = interaction.options.getSubcommand();

  if (sub === "create") {
    await handleCreate(interaction, messaging);
  } else if (sub === "list") {
    await handleList(interaction);
  } else if (sub === "cancel") {
    await handleCancel(interaction, messaging);
  }
}

// ── Create ────────────────────────────────────────────────

async function handleCreate(
  interaction: ChatInputCommandInteraction,
  messaging?: MessagingPort,
) {
  const titleOpt = interaction.options.getString("title");
  const dateStr = interaction.options.getString("date", true);
  const tz = interaction.options.getString("timezone") ?? "UTC";
  const campaignIdOpt = interaction.options.getString("campaign");

  // Parse the user-supplied date in the given timezone
  const parsed = parseDateInTZ(dateStr, tz);
  if (!parsed || Number.isNaN(parsed.getTime())) {
    await interaction.reply({
      content:
        "❌ Invalid date. Please use the format `YYYY-MM-DD HH:mm` and a valid IANA timezone.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (parsed.getTime() < Date.now()) {
    await interaction.reply({
      content: "❌ That date is in the past!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const id = randomUUID().slice(0, 8);

  const channel = interaction.channel;
  if (!channel) {
    await interaction.reply({
      content: "\u274c Could not resolve the channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // If a campaign was specified, resolve it and auto-generate the title
  let title = titleOpt ?? "";
  let campaignId = "";
  let vttLink = "";

  if (campaignIdOpt) {
    const campaigns = await getChannelCampaigns(interaction.channelId);
    const campaign = campaigns.find((c) => c.id === campaignIdOpt);
    if (!campaign) {
      await interaction.reply({
        content: "❌ Campaign not found in this channel. Use `/campaign list`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const sessionNum = await nextSessionNumber(campaign.id);
    // Use custom title if provided, otherwise auto-generate from campaign
    title = title || `${campaign.name} — Session ${sessionNum}`;
    campaignId = campaign.id;
    vttLink = campaign.vttLink;
  }

  if (!title) {
    await interaction.reply({
      content: "❌ Please provide a `title` or a `campaign` to auto-generate one.",
      flags: MessageFlags.Ephemeral,
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
    campaignId,
    vttLink,
    messageId: "", // will be set after sending
    rsvps: [] as string[],
    declined: [] as string[],
    rescheduleActive: false,
    rescheduleMessageId: "",
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

  await messaging?.publish<SessionCreatedEvent>(Subjects.SESSION_CREATED, { session });
}

// ── List ──────────────────────────────────────────────────

async function handleList(interaction: ChatInputCommandInteraction) {
  const sessions = await getUpcomingSessions(interaction.guildId ?? "");

  if (sessions.length === 0) {
    await interaction.reply({
      content: "📭 No upcoming sessions. Use `/session create` to schedule one!",
      flags: MessageFlags.Ephemeral,
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

async function handleCancel(
  interaction: ChatInputCommandInteraction,
  messaging?: MessagingPort,
) {
  const id = interaction.options.getString("id", true);
  const sessions = await getUpcomingSessions(interaction.guildId ?? "");
  const session = sessions.find((s) => s.id === id);

  if (!session) {
    await interaction.reply({
      content: "❌ Session not found. Use `/session list` to see upcoming sessions.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // If this session belongs to a campaign, give the session number back
  if (session.campaignId) {
    await decrementSessionCounter(session.campaignId);
  }

  await removeSession(id);
  await interaction.reply(`🗑️ Session **${session.title}** has been cancelled.`);

  await messaging?.publish<SessionCancelledEvent>(Subjects.SESSION_CANCELLED, {
    sessionId: id,
    cancelledBy: interaction.user.id,
    title: session.title,
    campaignId: session.campaignId,
  });
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
