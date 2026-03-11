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
  // Session commands (inbound — trigger side effects)
  SESSION_CREATE_REQUESTED: "session.create.requested",
  SESSION_CANCEL_REQUESTED: "session.cancel.requested",

  // Session lifecycle
  SESSION_CREATED: "session.created",
  SESSION_CANCELLED: "session.cancelled",
  SESSION_RESCHEDULED: "session.rescheduled",
  SESSION_CLEANED_UP: "session.cleaned_up",

  // RSVP commands (inbound)
  RSVP_ATTEND_REQUESTED: "rsvp.attend.requested",
  RSVP_DECLINE_REQUESTED: "rsvp.decline.requested",

  // RSVP lifecycle
  RSVP_ATTENDED: "rsvp.attended",
  RSVP_DECLINED: "rsvp.declined",

  // Reminders
  REMINDER_24H_SENT: "reminder.24h_sent",
  REMINDER_START_SENT: "reminder.start_sent",

  // Reschedule polls
  RESCHEDULE_POLL_OPENED: "reschedule.poll_opened",
  RESCHEDULE_POLL_RESOLVED: "reschedule.poll_resolved",

  // Campaign commands (inbound)
  CAMPAIGN_CREATE_REQUESTED: "campaign.create.requested",
  CAMPAIGN_EDIT_REQUESTED: "campaign.edit.requested",
  CAMPAIGN_DELETE_REQUESTED: "campaign.delete.requested",

  // Campaign lifecycle
  CAMPAIGN_CREATED: "campaign.created",
  CAMPAIGN_UPDATED: "campaign.updated",
  CAMPAIGN_DELETED: "campaign.deleted",
} as const;

export type Subject = (typeof Subjects)[keyof typeof Subjects];

// ── Payloads ──────────────────────────────────────────────

/** Command event — carries everything the consumer needs to create a session */
export interface SessionCreateRequestedEvent {
  /** Pre-built session object (without messageId — set by the consumer) */
  session: Omit<Session, "messageId"> & { messageId: "" };
  /** Number of non-bot members in the channel (for the RSVP card) */
  memberCount: number;
  /** Display name of the user who ran the command (for the embed footer) */
  createdByDisplayName: string;
  /** Discord interaction token — needed to edit the deferred reply */
  interactionToken: string;
  /** Discord application ID — needed for the webhook URL */
  applicationId: string;
}

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

// ── Command event payloads ────────────────────────────────

/** Shared context needed to edit a deferred interaction reply */
export interface InteractionContext {
  interactionToken: string;
  applicationId: string;
}

export interface SessionCancelRequestedEvent extends InteractionContext {
  sessionId: string;
  guildId: string;
  cancelledBy: string;
}

export interface RsvpAttendRequestedEvent extends InteractionContext {
  sessionId: string;
  userId: string;
  channelId: string;
  /** The message ID of the session card (for updating via channel message edit) */
  sessionMessageId: string;
}

export interface RsvpDeclineRequestedEvent extends InteractionContext {
  sessionId: string;
  userId: string;
  userDisplayName: string;
  channelId: string;
  sessionMessageId: string;
}

export interface CampaignCreateRequestedEvent extends InteractionContext {
  campaign: Campaign;
  createdByDisplayName: string;
}

export interface CampaignEditRequestedEvent extends InteractionContext {
  campaignId: string;
  channelId: string;
  newName: string | null;
  newVtt: string | null;
}

export interface CampaignDeleteRequestedEvent extends InteractionContext {
  campaignId: string;
  channelId: string;
  deletedBy: string;
}
