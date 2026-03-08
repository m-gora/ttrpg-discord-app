/**
 * SQLite adapter — uses Bun's built-in bun:sqlite for zero-dependency
 * persistent storage behind the StoragePort interface.
 */

import { Database } from "bun:sqlite";
import type { Session } from "../sessions";
import type { Campaign } from "../campaigns";
import type { StoragePort, SessionStore, CampaignStore } from "./port";

// ── Schema / migrations ─────────────────────────────────

const MIGRATIONS = /* sql */ `
  CREATE TABLE IF NOT EXISTS sessions (
    id                  TEXT PRIMARY KEY,
    guild_id            TEXT NOT NULL,
    channel_id          TEXT NOT NULL,
    title               TEXT NOT NULL,
    date                TEXT NOT NULL,
    created_by          TEXT NOT NULL,
    campaign_id         TEXT NOT NULL DEFAULT '',
    vtt_link            TEXT NOT NULL DEFAULT '',
    message_id          TEXT NOT NULL DEFAULT '',
    rsvps               TEXT NOT NULL DEFAULT '[]',
    declined            TEXT NOT NULL DEFAULT '[]',
    reschedule_active   INTEGER NOT NULL DEFAULT 0,
    reschedule_message_id TEXT NOT NULL DEFAULT '',
    reminded_24h        INTEGER NOT NULL DEFAULT 0,
    reminded_start      INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id               TEXT PRIMARY KEY,
    channel_id       TEXT NOT NULL,
    guild_id         TEXT NOT NULL,
    name             TEXT NOT NULL,
    vtt_link         TEXT NOT NULL DEFAULT '',
    session_counter  INTEGER NOT NULL DEFAULT 0,
    created_by       TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_guild_date ON sessions (guild_id, date);
  CREATE INDEX IF NOT EXISTS idx_campaigns_channel    ON campaigns (channel_id);
`;

// ── Row ↔ Domain mappers ────────────────────────────────

interface SessionRow {
  id: string;
  guild_id: string;
  channel_id: string;
  title: string;
  date: string;
  created_by: string;
  campaign_id: string;
  vtt_link: string;
  message_id: string;
  rsvps: string;
  declined: string;
  reschedule_active: number;
  reschedule_message_id: string;
  reminded_24h: number;
  reminded_start: number;
}

function rowToSession(r: SessionRow): Session {
  return {
    id: r.id,
    guildId: r.guild_id,
    channelId: r.channel_id,
    title: r.title,
    date: r.date,
    createdBy: r.created_by,
    campaignId: r.campaign_id,
    vttLink: r.vtt_link,
    messageId: r.message_id,
    rsvps: JSON.parse(r.rsvps) as string[],
    declined: JSON.parse(r.declined) as string[],
    rescheduleActive: r.reschedule_active === 1,
    rescheduleMessageId: r.reschedule_message_id,
    reminded24h: r.reminded_24h === 1,
    remindedStart: r.reminded_start === 1,
  };
}

interface CampaignRow {
  id: string;
  channel_id: string;
  guild_id: string;
  name: string;
  vtt_link: string;
  session_counter: number;
  created_by: string;
}

function rowToCampaign(r: CampaignRow): Campaign {
  return {
    id: r.id,
    channelId: r.channel_id,
    guildId: r.guild_id,
    name: r.name,
    vttLink: r.vtt_link,
    sessionCounter: r.session_counter,
    createdBy: r.created_by,
  };
}

// ── Session store ───────────────────────────────────────

function createSessionStore(db: Database): SessionStore {
  const insertStmt = db.prepare<void, [
    string, string, string, string, string, string,
    string, string, string, string, string,
    number, string, number, number,
  ]>(`
    INSERT INTO sessions
      (id, guild_id, channel_id, title, date, created_by,
       campaign_id, vtt_link, message_id, rsvps, declined,
       reschedule_active, reschedule_message_id, reminded_24h, reminded_start)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateStmt = db.prepare<void, [
    string, string, string, string, string,
    string, string, string, string,
    number, string, number, number,
    string,
  ]>(`
    UPDATE sessions SET
      guild_id = ?, channel_id = ?, title = ?, date = ?, created_by = ?,
      campaign_id = ?, vtt_link = ?, message_id = ?, rsvps = ?, declined = ?,
      reschedule_active = ?, reschedule_message_id = ?,
      reminded_24h = ?, reminded_start = ?
    WHERE id = ?
    -- note: the trailing bind param ^^^ is the WHERE id
  `);

  const deleteStmt = db.prepare<void, [string]>(
    `DELETE FROM sessions WHERE id = ?`,
  );

  return {
    async getSessions() {
      return db.query("SELECT * FROM sessions").all() .map((r) => rowToSession(r as SessionRow));
    },

    async addSession(session) {
      insertStmt.run(
        session.id, session.guildId, session.channelId,
        session.title, session.date, session.createdBy,
        session.campaignId, session.vttLink, session.messageId,
        JSON.stringify(session.rsvps), JSON.stringify(session.declined),
        session.rescheduleActive ? 1 : 0,
        session.rescheduleMessageId,
        session.reminded24h ? 1 : 0,
        session.remindedStart ? 1 : 0,
      );
    },

    async updateSession(updated) {
      updateStmt.run(
        updated.guildId, updated.channelId, updated.title,
        updated.date, updated.createdBy, updated.campaignId,
        updated.vttLink, updated.messageId,
        JSON.stringify(updated.rsvps), JSON.stringify(updated.declined),
        updated.rescheduleActive ? 1 : 0,
        updated.rescheduleMessageId,
        updated.reminded24h ? 1 : 0,
        updated.remindedStart ? 1 : 0,
        updated.id,
      );
    },

    async removeSession(id) {
      deleteStmt.run(id);
    },

    async getUpcomingSessions(guildId) {
      const rows = db
        .query(
          "SELECT * FROM sessions WHERE guild_id = ? AND date > ? ORDER BY date ASC",
        )
        .all(guildId, new Date().toISOString()) as SessionRow[];
      return rows.map(rowToSession);
    },
  };
}

// ── Campaign store ──────────────────────────────────────

function createCampaignStore(db: Database): CampaignStore {
  const insertStmt = db.prepare<void, [string, string, string, string, string, number, string]>(`
    INSERT INTO campaigns (id, channel_id, guild_id, name, vtt_link, session_counter, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const updateStmt = db.prepare<void, [string, string, string, string, number, string, string]>(`
    UPDATE campaigns SET
      channel_id = ?, guild_id = ?, name = ?, vtt_link = ?,
      session_counter = ?, created_by = ?
    WHERE id = ?
  `);

  const deleteStmt = db.prepare<void, [string]>(
    `DELETE FROM campaigns WHERE id = ?`,
  );

  return {
    async getCampaigns() {
      return db.query("SELECT * FROM campaigns").all().map((r) => rowToCampaign(r as CampaignRow));
    },

    async addCampaign(campaign) {
      insertStmt.run(
        campaign.id, campaign.channelId, campaign.guildId,
        campaign.name, campaign.vttLink, campaign.sessionCounter,
        campaign.createdBy,
      );
    },

    async updateCampaign(updated) {
      updateStmt.run(
        updated.channelId, updated.guildId, updated.name,
        updated.vttLink, updated.sessionCounter, updated.createdBy,
        updated.id,
      );
    },

    async removeCampaign(id) {
      deleteStmt.run(id);
    },

    async getChannelCampaigns(channelId) {
      const rows = db
        .query("SELECT * FROM campaigns WHERE channel_id = ?")
        .all(channelId) as CampaignRow[];
      return rows.map(rowToCampaign);
    },

    async nextSessionNumber(campaignId) {
      const row = db
        .query("SELECT session_counter FROM campaigns WHERE id = ?")
        .get(campaignId) as { session_counter: number } | null;
      if (!row) return 1;
      const next = row.session_counter + 1;
      db.run("UPDATE campaigns SET session_counter = ? WHERE id = ?", [next, campaignId]);
      return next;
    },

    async decrementSessionCounter(campaignId) {
      db.run(
        "UPDATE campaigns SET session_counter = MAX(0, session_counter - 1) WHERE id = ?",
        [campaignId],
      );
    },
  };
}

// ── Factory ─────────────────────────────────────────────

export function createSqliteStorage(dbPath: string): StoragePort {
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read/write performance
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  return {
    sessions: createSessionStore(db),
    campaigns: createCampaignStore(db),

    async init() {
      db.exec(MIGRATIONS);
      console.log(`[sqlite] Database initialised at ${dbPath}`);
    },

    async close() {
      db.close();
      console.log("[sqlite] Database closed");
    },
  };
}
