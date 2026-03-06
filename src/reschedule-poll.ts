import {
  PollLayoutType,
  EmbedBuilder,
  time,
  type Client,
  type SendableChannels,
} from "discord.js";
import type { Session } from "./sessions";
import { getSessions, updateSession } from "./sessions";
import { buildSessionCard, countChannelMembers } from "./session-card";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/**
 * Build the 7 candidate dates from the original session's date,
 * each on consecutive days at the same UTC time.
 */
function buildCandidateDates(originalDate: Date): { text: string; date: Date }[] {
  const hours = originalDate.getUTCHours();
  const minutes = originalDate.getUTCMinutes();
  const options: { text: string; date: Date }[] = [];

  for (let i = 1; i <= 7; i++) {
    const d = new Date(originalDate);
    d.setUTCDate(d.getUTCDate() + i);
    d.setUTCHours(hours, minutes, 0, 0);

    const dayName = DAY_NAMES[d.getUTCDay()];
    const monthName = MONTH_NAMES[d.getUTCMonth()];
    const day = d.getUTCDate();
    const timeStr = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;

    options.push({
      text: `${dayName}, ${monthName} ${day} — ${timeStr}`,
      date: d,
    });
  }

  return options;
}

/**
 * Open a reschedule poll in the channel with up to 7 date options
 * (the next 7 days at the same time as the original session).
 */
export async function openReschedulePoll(
  channel: SendableChannels,
  session: Session,
  declinedByUsername: string,
): Promise<void> {
  // Don't open another poll if one is already active
  if (session.rescheduleActive) return;

  const originalDate = new Date(session.date);
  const options = buildCandidateDates(originalDate);

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
  await updateSession(session);
}

/**
 * Called by the scheduler — checks if any reschedule poll has ended,
 * tallies the votes, picks the winning date, and updates the session.
 */
export async function checkReschedulePolls(client: Client): Promise<void> {
  const sessions = await getSessions();

  for (const session of sessions) {
    if (!session.rescheduleActive || !session.rescheduleMessageId) continue;

    try {
      await processReschedulePoll(client, session);
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
): Promise<void> {
  const channel = await client.channels.fetch(session.channelId);
  if (!channel?.isTextBased() || !channel.isSendable()) return;

  const message = await channel.messages.fetch(session.rescheduleMessageId);
  const poll = message.poll;
  if (!poll?.resultsFinalized) return;

  // Tally votes: find the answer with the most votes
  const candidates = buildCandidateDates(new Date(session.date));
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
  session.date = winningDate.date.toISOString();
  session.rescheduleActive = false;
  session.rescheduleMessageId = "";
  session.rsvps = [];
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
  const memberCount = await countChannelMembers(channel);
  const { embed, row } = buildSessionCard(session, memberCount);
  const newCard = await channel.send({
    embeds: [embed],
    components: [row],
  });

  session.messageId = newCard.id;
  await updateSession(session);
}
