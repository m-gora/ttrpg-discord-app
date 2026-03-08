/**
 * Storage port — the application's contract for persisting sessions and campaigns.
 *
 * Any adapter (JSON files, SQLite, Postgres, …) must implement this interface
 * so the rest of the app stays storage-agnostic.
 */

import type { Session } from "../sessions";
import type { Campaign } from "../campaigns";

export interface SessionStore {
  getSessions(): Promise<Session[]>;
  addSession(session: Session): Promise<void>;
  updateSession(updated: Session): Promise<void>;
  removeSession(id: string): Promise<void>;
  getUpcomingSessions(guildId: string): Promise<Session[]>;
}

export interface CampaignStore {
  getCampaigns(): Promise<Campaign[]>;
  addCampaign(campaign: Campaign): Promise<void>;
  updateCampaign(updated: Campaign): Promise<void>;
  removeCampaign(id: string): Promise<void>;
  getChannelCampaigns(channelId: string): Promise<Campaign[]>;
  nextSessionNumber(campaignId: string): Promise<number>;
  decrementSessionCounter(campaignId: string): Promise<void>;
}

/** Combined store handed to the application layer */
export interface StoragePort {
  sessions: SessionStore;
  campaigns: CampaignStore;
  /** Optional lifecycle hook — called once at startup (e.g. run migrations) */
  init?(): Promise<void>;
  /** Optional lifecycle hook — called on graceful shutdown */
  close?(): Promise<void>;
}
