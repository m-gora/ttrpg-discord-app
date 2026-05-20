import {
  PollLayoutType,
  EmbedBuilder,
  time,
  type Client,
  type SendableChannels,
} from "discord.js";
import type { Session } from "./sessions";
import { getSessions, updateSession } from "./sessions";
import { buildSessionCard } from "./session-card";
import { getCampaign } from "./campaigns";
import { parseDurationDays } from "./recurrence";
import type { MessagingPort } from "./messaging/port";
import { Subjects } from "./messaging/events";
import type {
  ReschedulePollOpenedEvent,
  ReschedulePollResolvedEvent,
  SessionRescheduledEvent,
} from "./messaging/events";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * Build candidate dates from the day after `triggerDate` up to (and including)
 * `endDate`, each at the given UTC hours/minutes.
 * Capped at 10 entries (Discord poll limit).
 */
function buildCandidateDates(
  triggerDate: Date,
  endDate: Date,
  hours: number,
  minutes: number,
): { text: string; date: Date }[] {
  const options: { text: string; date: Date }[] = [];

  const cursor = new Date(triggerDate);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  cursor.setUTCHours(hours, minutes, 0, 0);

  const end = new Date(endDate);
  end.setUTCHours(hours, minutes, 0, 0);

  while (cursor <= end && options.length < 10) {
    const dayName = DAY_NAMES[cursor.getUTCDay()];
    const monthName = MONTH_NAMES[cursor.getUTCMonth()];
    const day = cursor.getUTCDate();
    const timeStr = `${String(cursor.getUTCHours()).padStart(2, "0")}:${String(cursor.getUTCMinutes()).padStart(2, "0")} UTC`;

    options.push({
      text: `${dayName}, ${monthName} ${day} — ${timeStr}`,
      date: new Date(cursor),
    });

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return options;
}

/**
 * Resolve the upper bound for reschedule candidates.
 * Returns the next regular session slot (originalDate + recurrence days).
 * Falls back to triggerDate + 7 days when no campaign recurrence is set,
 * or when the computed slot is already in the past relative to triggerDate.
 */
async function resolveNextRegularSlot(session: Session, triggerDate: Date): Promise<Date> {
  if (session.campaignId) {
    const campaign = await getCampaign(session.campaignId);
    if (campaign?.recurrence) {
      const days = parseDurationDays(campaign.recurrence);
      if (days > 0) {
        const originalDate = new Date(session.originalDate ?? session.date);
        const nextSlot = new Date(originalDate);
        nextSlot.setUTCDate(nextSlot.getUTCDate() + days);
        if (nextSlot > triggerDate) {
          return nextSlot;
        }
      }
    }
  }

  // Fallback: offer 7 days from trigger
  const fallback = new Date(triggerDate);
  fallback.setUTCDate(fallback.getUTCDate() + 7);
  return fallback;
}

/**
 * Open a reschedule poll in the channel.
 * Offers one option per day from tomorrow (relative to when the decline happened)
 * up to the next regular recurrence slot, at the same time as the original session.
 */
export async function openReschedulePoll(
  channel: SendableChannels,
  session: Session,
  declinedByUsername: string,
  messaging?: MessagingPort,
): Promise<void> {
  // Don't open another poll if one is already active
  if (session.rescheduleActive) return;

  const now = new Date();
  const originalDate = new Date(session.originalDate ?? session.date);
  const hours = originalDate.getUTCHours();
  const minutes = originalDate.getUTCMinutes();

  const nextSlot = await resolveNextRegularSlot(session, now);
  const options = buildCandidateDates(now, nextSlot, hours, minutes);

  // Safety: ensure at least one option even if the next slot is very close
  if (options.length === 0) {
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(hours, minutes, 0, 0);
    options.push({
      text: `${DAY_NAMES[tomorrow.getUTCDay()]}, ${MONTH_NAMES[tomorrow.getUTCMonth()]} ${tomorrow.getUTCDate()} — ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} UTC`,
      date: tomorrow,
    });
  }

  session.rescheduleTriggeredAt = now.toISOString();

  const pollMessage = await channel.send({
    content: `📊 **${declinedByUsername}** can't make it to **${session.title}**! Vote for the best reschedule date:`,
    poll: {
      question: { text: `Reschedule: ${session.title}` },
      answers: options.map((o) => ({ text: o.text })),
      duration: 24, // poll lasts 24 hours
      allowMultiselect: true,
      layoutType: PollLayoutType.Default,
    },
  });

  session.rescheduleActive = true;
  session.rescheduleMessageId = pollMessage.id;
  await updateSession(session); // persists rescheduleTriggeredAt too

  await messaging?.publish<ReschedulePollOpenedEvent>(Subjects.RESCHEDULE_POLL_OPENED, {
    sessionId: session.id,
    title: session.title,
    pollMessageId: pollMessage.id,
    declinedByUsername,
  });
}

/**
 * Called by the scheduler — checks if any reschedule poll has ended,
 * tallies the votes, picks the winning date, and updates the session.
 */
export async function checkReschedulePolls(
  client: Client,
  messaging?: MessagingPort,
): Promise<void> {
  const sessions = await getSessions();

  for (const session of sessions) {
    if (!session.rescheduleActive || !session.rescheduleMessageId) continue;

    try {
      await processReschedulePoll(client, session, messaging);
    } catch (err) {
      console.error(
        `[reschedule] Error processing poll for session ${session.id}:`,
        err,
      );
    }
  }
}

async function processReschedulePoll(
  client: Client,
  session: Session,
  messaging?: MessagingPort,
): Promise<void> {
  const channel = await client.channels.fetch(session.channelId);
  if (!channel?.isTextBased() || !channel.isSendable()) return;

  const message = await channel.messages.fetch(session.rescheduleMessageId);
  const poll = message.poll;
  if (!poll?.resultsFinalized) return;

  // Tally votes: reconstruct the exact same candidates that were shown in the poll
  const originalDate = new Date(session.originalDate ?? session.date);
  const hours = originalDate.getUTCHours();
  const minutes = originalDate.getUTCMinutes();
  const triggerDate = session.rescheduleTriggeredAt
    ? new Date(session.rescheduleTriggeredAt)
    : new Date(session.date); // legacy fallback: reproduces the old day+1…day+7 range
  const nextSlot = await resolveNextRegularSlot(session, triggerDate);
  const candidates = buildCandidateDates(triggerDate, nextSlot, hours, minutes);
  let bestIdx = 0;
  let bestVotes = 0;

  for (const answer of poll.answers.values()) {
    if (answer.voteCount > bestVotes) {
      bestVotes = answer.voteCount;
      bestIdx = answer.id - 1; // answer IDs are 1-based
    }
  }

  const winningDate = candidates[bestIdx];
  if (!winningDate) return;

  // Update the session with the new date and reset state
  if (!session.originalDate) {
    session.originalDate = session.date;
  }
  session.date = winningDate.date.toISOString();
  session.rescheduleActive = false;
  session.rescheduleMessageId = "";
  session.rsvps = [];
  session.declined = [];
  session.reminded24h = false;
  session.remindedStart = false;
  await updateSession(session);

  // Announce the result
  const d = winningDate.date;
  const resultEmbed = new EmbedBuilder()
    .setTitle("📅 Session Rescheduled!")
    .setColor(0x57f287)
    .setDescription(
      `**${session.title}** has been rescheduled to:\n\n` +
        `${time(d, "F")} (${time(d, "R")})\n\n` +
        `*${bestVotes} vote(s) for this date. Please RSVP again!*`,
    );

  await channel.send({ embeds: [resultEmbed] });

  // Post a fresh session card with RSVP button
  const { embed, row } = await buildSessionCard(session);
  const newCard = await channel.send({
    embeds: [embed],
    components: [row],
  });

  session.messageId = newCard.id;
  await updateSession(session);

  await messaging?.publish<ReschedulePollResolvedEvent>(Subjects.RESCHEDULE_POLL_RESOLVED, {
    sessionId: session.id,
    title: session.title,
    winningDate: winningDate.date.toISOString(),
    votes: bestVotes,
  });

  await messaging?.publish<SessionRescheduledEvent>(Subjects.SESSION_RESCHEDULED, {
    sessionId: session.id,
    previousDate: new Date(session.date).toISOString(),
    newDate: winningDate.date.toISOString(),
    title: session.title,
    votes: bestVotes,
  });
}
