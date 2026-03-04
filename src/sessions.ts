import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { CONFIG } from "./config";

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
  /** Discord message ID of the session card (for editing the embed) */
  messageId: string;
  /** Array of user IDs who have RSVPd */
  rsvps: string[];
  /** Whether the 1-day-before reminder has been sent */
  reminded24h: boolean;
  /** Whether the "starting now" reminder has been sent */
  remindedStart: boolean;
}

const filePath = CONFIG.SESSIONS_FILE;

async function load(): Promise<Session[]> {
  if (!existsSync(filePath)) return [];
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as Session[];
  } catch {
    return [];
  }
}

async function save(sessions: Session[]): Promise<void> {
  await writeFile(filePath, JSON.stringify(sessions, null, 2), "utf-8");
}

/** Return all stored sessions */
export async function getSessions(): Promise<Session[]> {
  return load();
}

/** Add a new session and persist to disk */
export async function addSession(session: Session): Promise<void> {
  const sessions = await load();
  sessions.push(session);
  await save(sessions);
}

/** Update a session in-place (matched by id) and persist */
export async function updateSession(updated: Session): Promise<void> {
  const sessions = await load();
  const idx = sessions.findIndex((s) => s.id === updated.id);
  if (idx !== -1) {
    sessions[idx] = updated;
    await save(sessions);
  }
}

/** Remove a session by id and persist */
export async function removeSession(id: string): Promise<void> {
  let sessions = await load();
  sessions = sessions.filter((s) => s.id !== id);
  await save(sessions);
}

/** List upcoming sessions for a guild, sorted by date */
export async function getUpcomingSessions(guildId: string): Promise<Session[]> {
  const sessions = await load();
  const now = new Date();
  return sessions
    .filter((s) => s.guildId === guildId && new Date(s.date) > now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
