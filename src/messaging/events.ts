/**
 * Domain events emitted by the TTRPG Discord app.
 *
 * Each event type maps to a subject string used for publishing / subscribing.
 * Subjects follow the convention: <aggregate>.<action>
 */

import type { Session } from "../sessions";
import type { Campaign } from "../campaigns";

// ── Subject constants ─────────────────────────────────────

export const Subjects = {
  // Session lifecycle
  SESSION_CREATED: "session.created",
  SESSION_CANCELLED: "session.cancelled",
  SESSION_RESCHEDULED: "session.rescheduled",
  SESSION_CLEANED_UP: "session.cleaned_up",

  // RSVP
  RSVP_ATTENDED: "rsvp.attended",
  RSVP_DECLINED: "rsvp.declined",

  // Reminders
  REMINDER_24H_SENT: "reminder.24h_sent",
  REMINDER_START_SENT: "reminder.start_sent",

  // Reschedule polls
  RESCHEDULE_POLL_OPENED: "reschedule.poll_opened",
  RESCHEDULE_POLL_RESOLVED: "reschedule.poll_resolved",

  // Campaign lifecycle
  CAMPAIGN_CREATED: "campaign.created",
  CAMPAIGN_UPDATED: "campaign.updated",
  CAMPAIGN_DELETED: "campaign.deleted",
} as const;

export type Subject = (typeof Subjects)[keyof typeof Subjects];

// ── Payloads ──────────────────────────────────────────────

export interface SessionCreatedEvent {
  session: Session;
}

export interface SessionCancelledEvent {
  sessionId: string;
  cancelledBy: string;
  title: string;
  campaignId: string;
}

export interface SessionRescheduledEvent {
  sessionId: string;
  previousDate: string;
  newDate: string;
  title: string;
  votes: number;
}

export interface SessionCleanedUpEvent {
  sessionId: string;
  title: string;
}

export interface RsvpAttendedEvent {
  sessionId: string;
  userId: string;
  totalAttending: number;
}

export interface RsvpDeclinedEvent {
  sessionId: string;
  userId: string;
  totalDeclined: number;
}

export interface Reminder24hSentEvent {
  sessionId: string;
  title: string;
  channelId: string;
}

export interface ReminderStartSentEvent {
  sessionId: string;
  title: string;
  channelId: string;
}

export interface ReschedulePollOpenedEvent {
  sessionId: string;
  title: string;
  pollMessageId: string;
  declinedByUsername: string;
}

export interface ReschedulePollResolvedEvent {
  sessionId: string;
  title: string;
  winningDate: string;
  votes: number;
}

export interface CampaignCreatedEvent {
  campaign: Campaign;
}

export interface CampaignUpdatedEvent {
  campaign: Campaign;
  updatedFields: string[];
}

export interface CampaignDeletedEvent {
  campaignId: string;
  name: string;
  deletedBy: string;
}
