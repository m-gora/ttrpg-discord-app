import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { CONFIG } from "./config";

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
  /** Auto-incrementing session counter (not counting cancelled sessions) */
  sessionCounter: number;
  /** User who created the campaign */
  createdBy: string;
}

const filePath = CONFIG.CAMPAIGNS_FILE;

async function load(): Promise<Campaign[]> {
  if (!existsSync(filePath)) return [];
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as Campaign[];
  } catch {
    return [];
  }
}

async function save(campaigns: Campaign[]): Promise<void> {
  await writeFile(filePath, JSON.stringify(campaigns, null, 2), "utf-8");
}

/** Return all stored campaigns */
export async function getCampaigns(): Promise<Campaign[]> {
  return load();
}

/** Add a new campaign and persist to disk */
export async function addCampaign(campaign: Campaign): Promise<void> {
  const campaigns = await load();
  campaigns.push(campaign);
  await save(campaigns);
}

/** Update a campaign in-place (matched by id) and persist */
export async function updateCampaign(updated: Campaign): Promise<void> {
  const campaigns = await load();
  const idx = campaigns.findIndex((c) => c.id === updated.id);
  if (idx !== -1) {
    campaigns[idx] = updated;
    await save(campaigns);
  }
}

/** Remove a campaign by id and persist */
export async function removeCampaign(id: string): Promise<void> {
  let campaigns = await load();
  campaigns = campaigns.filter((c) => c.id !== id);
  await save(campaigns);
}

/** List campaigns for a channel */
export async function getChannelCampaigns(channelId: string): Promise<Campaign[]> {
  const campaigns = await load();
  return campaigns.filter((c) => c.channelId === channelId);
}

/**
 * Increment the session counter for a campaign and return the new value.
 * This should be called when a new session is created (not on reschedule).
 */
export async function nextSessionNumber(campaignId: string): Promise<number> {
  const campaigns = await load();
  const campaign = campaigns.find((c) => c.id === campaignId);
  if (!campaign) return 1;
  campaign.sessionCounter += 1;
  await save(campaigns);
  return campaign.sessionCounter;
}

/**
 * Decrement the session counter for a campaign (e.g. when a session is cancelled).
 * Ensures the counter never goes below 0.
 */
export async function decrementSessionCounter(campaignId: string): Promise<void> {
  const campaigns = await load();
  const campaign = campaigns.find((c) => c.id === campaignId);
  if (!campaign) return;
  campaign.sessionCounter = Math.max(0, campaign.sessionCounter - 1);
  await save(campaigns);
}
