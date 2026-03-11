import cron from "node-cron";
import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, time } from "discord.js";
import type { SendableChannels } from "discord.js";
import { getSessions, updateSession, removeSession, type Session } from "./sessions";
import { getCampaign, nextSessionNumber } from "./campaigns";
import { computeNextSessionDate } from "./recurrence";
import { checkReschedulePolls } from "./reschedule-poll";
import type { MessagingPort } from "./messaging/port";
import { Subjects } from "./messaging/events";
import type {
  Reminder24hSentEvent,
  ReminderStartSentEvent,
  SessionCleanedUpEvent,
  SessionCreateRequestedEvent,
} from "./messaging/events";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;

/**
 * Start a cron job that checks every minute for sessions that need reminders.
 */
export function startScheduler(client: Client, messaging?: MessagingPort) {
  // Runs every minute
  cron.schedule("* * * * *", async () => {
    try {
      await checkReminders(client, messaging);
      await checkReschedulePolls(client, messaging);
    } catch (err) {
      console.error("[scheduler] Error checking reminders:", err);
    }
  });

  console.log("[scheduler] Reminder scheduler started (checking every minute)");
}

async function checkReminders(client: Client, messaging?: MessagingPort) {
  const sessions = await getSessions();
  const now = Date.now();

  if (sessions.length === 0) return;
  console.log(`[scheduler] Checking ${sessions.length} session(s)`);

  for (const session of sessions) {
    const sessionTime = new Date(session.date).getTime();
    const timeUntil = sessionTime - now;
    const hoursUntil = (timeUntil / 3_600_000).toFixed(1);

    if (shouldSend24hReminder(session, timeUntil)) {
      console.log(`[scheduler] Sending 24h reminder for "${session.title}" (${hoursUntil}h away)`);
      await send24hReminder(client, session, messaging);
    }

    if (shouldSendStartReminder(session, timeUntil)) {
      console.log(`[scheduler] Sending start reminder for "${session.title}"`);
      await sendStartReminder(client, session, messaging);
    }

    // Cleanup old sessions (1 hour after start)
    if (timeUntil < -60 * 60 * 1000) {
      console.log(`[scheduler] Cleaning up old session "${session.title}" (${session.id})`);

      // Auto-create next session if campaign has recurrence
      if (session.campaignId && messaging) {
        await maybeCreateNextRecurringSession(session, messaging);
      }

      await removeSession(session.id);
      await messaging?.publish<SessionCleanedUpEvent>(Subjects.SESSION_CLEANED_UP, {
        sessionId: session.id,
        title: session.title,
      });
    }
  }
}

function shouldSend24hReminder(session: { reminded24h: boolean }, timeUntil: number): boolean {
  return !session.reminded24h && timeUntil <= ONE_DAY_MS && timeUntil > 0;
}

function shouldSendStartReminder(session: { remindedStart: boolean }, timeUntil: number): boolean {
  return !session.remindedStart && timeUntil <= 0 && timeUntil > -FIVE_MIN_MS;
}

async function send24hReminder(client: Client, session: Session, messaging?: MessagingPort) {
  const channel = await resolveTextChannel(client, session.channelId, session.createdBy);
  if (!channel) {
    console.warn(`[scheduler] Could not resolve channel ${session.channelId} for 24h reminder of "${session.title}" — will retry next cycle`);
    return;
  }

  const d = new Date(session.date);
  const embed = new EmbedBuilder()
    .setTitle("⏰ Session Tomorrow!")
    .setColor(0xfee75c)
    .setDescription(
      `**${session.title}** is happening tomorrow!\n\n` +
        `📅 ${time(d, "F")} (${time(d, "R")})`,
    );
  await channel.send({ content: "@everyone", embeds: [embed] });
  console.log(`[scheduler] 24h reminder sent for "${session.title}" in channel ${session.channelId}`);

  session.reminded24h = true;
  await updateSession(session);

  await messaging?.publish<Reminder24hSentEvent>(Subjects.REMINDER_24H_SENT, {
    sessionId: session.id,
    title: session.title,
    channelId: session.channelId,
  });
}

async function sendStartReminder(client: Client, session: Session, messaging?: MessagingPort) {
  const channel = await resolveTextChannel(client, session.channelId, session.createdBy);
  if (channel) {
    const mentions = session.rsvps.length > 0
      ? session.rsvps.map((uid) => `<@${uid}>`).join(" ")
      : "@everyone";

    const vttLine = session.vttLink
      ? `\n\n🔗 **Join the VTT:** ${session.vttLink}`
      : "";

    const embed = new EmbedBuilder()
      .setTitle("🎲 Session Starting Now!")
      .setColor(0xed4245)
      .setDescription(`**${session.title}** is starting right now! Grab your dice! 🎯${vttLine}`);

    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    if (session.vttLink) {
      components.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel("Open VTT")
            .setStyle(ButtonStyle.Link)
            .setURL(session.vttLink)
            .setEmoji("🗺️"),
        ),
      );
    }

    await channel.send({ content: mentions, embeds: [embed], components });
    console.log(`[scheduler] Start reminder sent for "${session.title}" in channel ${session.channelId}`);
  } else {
    console.warn(`[scheduler] Could not resolve channel ${session.channelId} for start reminder of "${session.title}" — will retry next cycle`);
    return;
  }
  session.remindedStart = true;
  await updateSession(session);

  await messaging?.publish<ReminderStartSentEvent>(Subjects.REMINDER_START_SENT, {
    sessionId: session.id,
    title: session.title,
    channelId: session.channelId,
  });
}

// ── Recurrence ────────────────────────────────────────────

import { randomUUID } from "node:crypto";

async function maybeCreateNextRecurringSession(
  session: Session,
  messaging: MessagingPort,
): Promise<void> {
  const campaign = await getCampaign(session.campaignId);
  if (!campaign?.recurrence) return;

  // Skip if the campaign already has another upcoming session
  const allSessions = await getSessions();
  const hasUpcoming = allSessions.some(
    (s) => s.campaignId === campaign.id && s.id !== session.id && new Date(s.date).getTime() > Date.now(),
  );
  if (hasUpcoming) {
    console.log(`[scheduler] Campaign "${campaign.name}" already has an upcoming session — skipping auto-create`);
    return;
  }

  // Use the original (pre-reschedule) date to keep the cadence stable
  const referenceDate = session.originalDate ?? session.date;
  const nextDate = computeNextSessionDate(referenceDate, campaign.recurrence);

  // Guard: don't create a session in the past (e.g. if bot was offline for a long time)
  if (new Date(nextDate).getTime() < Date.now()) {
    console.warn(`[scheduler] Skipping auto-create for "${campaign.name}" — next date ${nextDate} is in the past`);
    return;
  }

  const sessionNum = await nextSessionNumber(campaign.id);
  const title = `${campaign.name} — Session ${sessionNum}`;
  const id = randomUUID().slice(0, 8);

  const nextSession = {
    id,
    guildId: session.guildId,
    channelId: session.channelId,
    title,
    date: nextDate,
    createdBy: session.createdBy,
    campaignId: campaign.id,
    vttLink: campaign.vttLink,
    playerCount: campaign.playerCount,
    messageId: "" as const,
    rsvps: [] as string[],
    declined: [] as string[],
    rescheduleActive: false,
    rescheduleMessageId: "",
    reminded24h: false,
    remindedStart: false,
  };

  await messaging.publish<SessionCreateRequestedEvent>(
    Subjects.SESSION_CREATE_REQUESTED,
    {
      session: nextSession,
      createdByDisplayName: "Scheduler (auto-repeat)",
      // No interaction to edit — the consumer will post a new message
      interactionToken: "",
      applicationId: "",
    },
  );

  console.log(`[scheduler] Auto-created recurring session "${title}" for ${nextDate}`);
}

async function resolveTextChannel(
  client: Client,
  channelId: string,
  userId?: string,
): Promise<SendableChannels | null> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isSendable()) {
      return channel;
    }
    // Partial DM/group DM channels may not report as sendable — check isTextBased as fallback
    if (channel?.isTextBased() && "send" in channel) {
      return channel as SendableChannels;
    }
    console.warn(`[scheduler] Channel ${channelId} exists but is not sendable (type: ${channel?.type})`);
  } catch (err) {
    // DM channels can't always be fetched by ID — fall back to opening a DM with the user
    if (userId) {
      try {
        const user = await client.users.fetch(userId);
        const dm = await user.createDM();
        if (dm.isSendable()) return dm;
      } catch (dmErr) {
        console.warn(`[scheduler] Failed to open DM with user ${userId}:`, dmErr);
      }
    }
    console.warn(`[scheduler] Failed to fetch channel ${channelId}:`, err);
  }
  return null;
}
