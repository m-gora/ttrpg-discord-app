import type { CampaignStore } from "./storage/port";

export interface Campaign {
  id: string;
  /** Channel (guild or group DM) this campaign belongs to */
  channelId: string;
  /** Guild ID (empty string for group DMs) */
  guildId: string;
  /** Human-readable campaign name, e.g. "Curse of Strahd" */
  name: string;
  /** URL to the virtual tabletop (Foundry, Roll20, etc.) */
  vttLink: string;
  /** Total number of players + GM in this campaign */
  playerCount: number;
  /** Auto-incrementing session counter (not counting cancelled sessions) */
  sessionCounter: number;
  /** User who created the campaign */
  createdBy: string;
  /** IANA timezone for sessions in this campaign, e.g. "Europe/Rome" */
  timezone: string;
}

// ── Pluggable store (set once at startup via initCampaignStore) ──

let store: CampaignStore;

/**
 * Inject the concrete CampaignStore implementation.
 * Must be called once at startup before any campaign function is used.
 */
export function initCampaignStore(s: CampaignStore): void {
  store = s;
}

/** Return all stored campaigns */
export async function getCampaigns(): Promise<Campaign[]> {
  return store.getCampaigns();
}

/** Add a new campaign and persist */
export async function addCampaign(campaign: Campaign): Promise<void> {
  return store.addCampaign(campaign);
}

/** Update a campaign in-place (matched by id) and persist */
export async function updateCampaign(updated: Campaign): Promise<void> {
  return store.updateCampaign(updated);
}

/** Remove a campaign by id and persist */
export async function removeCampaign(id: string): Promise<void> {
  return store.removeCampaign(id);
}

/** List campaigns for a channel */
export async function getChannelCampaigns(channelId: string): Promise<Campaign[]> {
  return store.getChannelCampaigns(channelId);
}

/**
 * Increment the session counter for a campaign and return the new value.
 * This should be called when a new session is created (not on reschedule).
 */
export async function nextSessionNumber(campaignId: string): Promise<number> {
  return store.nextSessionNumber(campaignId);
}

/**
 * Decrement the session counter for a campaign (e.g. when a session is cancelled).
 * Ensures the counter never goes below 0.
 */
export async function decrementSessionCounter(campaignId: string): Promise<void> {
  return store.decrementSessionCounter(campaignId);
}
