import type { SessionStore } from "./storage/port";

export interface Session {
  id: string;
  /** The guild (server) where the session was created */
  guildId: string;
  /** The channel where the session was created – reminders are sent here */
  channelId: string;
  /** Human-readable title, e.g. "Curse of Strahd – Session 12" */
  title: string;
  /** ISO-8601 date-time string for when the session starts */
  date: string;
  /** ID of the user who created the session */
  createdBy: string;
  /** Optional campaign ID this session belongs to */
  campaignId: string;
  /** VTT link (copied from the campaign at creation time) */
  vttLink: string;
  /** Total players + GM (copied from campaign, or set manually) */
  playerCount: number;
  /** Discord message ID of the session card (for editing the embed) */
  messageId: string;
  /** Array of user IDs who have RSVPd (attending) */
  rsvps: string[];
  /** Array of user IDs who have explicitly declined */
  declined: string[];
  /** Whether a reschedule poll is currently active */
  rescheduleActive: boolean;
  /** Discord message ID of the active reschedule poll */
  rescheduleMessageId: string;
  /** Whether the 1-day-before reminder has been sent */
  reminded24h: boolean;
  /** Whether the "starting now" reminder has been sent */
  remindedStart: boolean;
}

// ── Pluggable store (set once at startup via initSessionStore) ──

let store: SessionStore;

/**
 * Inject the concrete SessionStore implementation.
 * Must be called once at startup before any session function is used.
 */
export function initSessionStore(s: SessionStore): void {
  store = s;
}

/** Return all stored sessions */
export async function getSessions(): Promise<Session[]> {
  return store.getSessions();
}

/** Add a new session and persist */
export async function addSession(session: Session): Promise<void> {
  return store.addSession(session);
}

/** Update a session in-place (matched by id) and persist */
export async function updateSession(updated: Session): Promise<void> {
  return store.updateSession(updated);
}

/** Remove a session by id and persist */
export async function removeSession(id: string): Promise<void> {
  return store.removeSession(id);
}

/** List upcoming sessions for a guild, sorted by date */
export async function getUpcomingSessions(guildId: string): Promise<Session[]> {
  return store.getUpcomingSessions(guildId);
}
