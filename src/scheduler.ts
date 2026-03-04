import cron from "node-cron";
import { Client, EmbedBuilder, time } from "discord.js";
import type { SendableChannels } from "discord.js";
import { getSessions, updateSession, removeSession } from "./sessions";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;

/**
 * Start a cron job that checks every minute for sessions that need reminders.
 */
export function startScheduler(client: Client) {
  // Runs every minute
  cron.schedule("* * * * *", async () => {
    try {
      await checkReminders(client);
    } catch (err) {
      console.error("[scheduler] Error checking reminders:", err);
    }
  });

  console.log("[scheduler] Reminder scheduler started (checking every minute)");
}

async function checkReminders(client: Client) {
  const sessions = await getSessions();
  const now = Date.now();

  for (const session of sessions) {
    const sessionTime = new Date(session.date).getTime();
    const timeUntil = sessionTime - now;

    // ── 24-hour reminder ─────────────────────────────────
    if (
      !session.reminded24h &&
      timeUntil <= ONE_DAY_MS &&
      timeUntil > ONE_DAY_MS - FIVE_MIN_MS // within a 5-min window to avoid re-sending
    ) {
      const channel = await resolveTextChannel(client, session.channelId);
      if (channel) {
        const d = new Date(session.date);
        const embed = new EmbedBuilder()
          .setTitle("⏰ Session Tomorrow!")
          .setColor(0xfee75c)
          .setDescription(
            `**${session.title}** is happening tomorrow!\n\n` +
              `📅 ${time(d, "F")} (${time(d, "R")})`,
          );

        await channel.send({ content: "@everyone", embeds: [embed] });
      }
      session.reminded24h = true;
      await updateSession(session);
    }

    // ── Start-time reminder ──────────────────────────────
    if (
      !session.remindedStart &&
      timeUntil <= 0 &&
      timeUntil > -FIVE_MIN_MS // within a 5-min window
    ) {
      const channel = await resolveTextChannel(client, session.channelId);
      if (channel) {
        const embed = new EmbedBuilder()
          .setTitle("🎲 Session Starting Now!")
          .setColor(0xed4245)
          .setDescription(
            `**${session.title}** is starting right now! Grab your dice! 🎯`,
          );

        await channel.send({ content: "@everyone", embeds: [embed] });
      }
      session.remindedStart = true;
      await updateSession(session);
    }

    // ── Cleanup old sessions (1 hour after start) ────────
    if (timeUntil < -60 * 60 * 1000) {
      await removeSession(session.id);
    }
  }
}

async function resolveTextChannel(
  client: Client,
  channelId: string,
): Promise<SendableChannels | null> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isSendable()) {
      return channel;
    }
  } catch {
    // channel may have been deleted
  }
  return null;
}
