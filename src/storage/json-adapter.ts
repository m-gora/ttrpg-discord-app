/**
 * JSON-file adapter — the original persistence strategy, now wrapped
 * behind the StoragePort interface.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Session } from "../sessions";
import type { Campaign } from "../campaigns";
import type { StoragePort, SessionStore, CampaignStore } from "./port";

// ── Helpers ─────────────────────────────────────────────

async function loadJson<T>(path: string): Promise<T[]> {
  if (!existsSync(path)) return [];
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

async function saveJson<T>(path: string, data: T[]): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2), "utf-8");
}

// ── Session store ───────────────────────────────────────

function createSessionStore(filePath: string): SessionStore {
  return {
    async getSessions() {
      return loadJson<Session>(filePath);
    },

    async addSession(session) {
      const sessions = await loadJson<Session>(filePath);
      sessions.push(session);
      await saveJson(filePath, sessions);
    },

    async updateSession(updated) {
      const sessions = await loadJson<Session>(filePath);
      const idx = sessions.findIndex((s) => s.id === updated.id);
      if (idx !== -1) {
        sessions[idx] = updated;
        await saveJson(filePath, sessions);
      }
    },

    async removeSession(id) {
      let sessions = await loadJson<Session>(filePath);
      sessions = sessions.filter((s) => s.id !== id);
      await saveJson(filePath, sessions);
    },

    async getUpcomingSessions(guildId) {
      const sessions = await loadJson<Session>(filePath);
      const now = new Date();
      return sessions
        .filter((s) => s.guildId === guildId && new Date(s.date) > now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    },
  };
}

// ── Campaign store ──────────────────────────────────────

function createCampaignStore(filePath: string): CampaignStore {
  return {
    async getCampaigns() {
      return loadJson<Campaign>(filePath);
    },

    async addCampaign(campaign) {
      const campaigns = await loadJson<Campaign>(filePath);
      campaigns.push(campaign);
      await saveJson(filePath, campaigns);
    },

    async updateCampaign(updated) {
      const campaigns = await loadJson<Campaign>(filePath);
      const idx = campaigns.findIndex((c) => c.id === updated.id);
      if (idx !== -1) {
        campaigns[idx] = updated;
        await saveJson(filePath, campaigns);
      }
    },

    async removeCampaign(id) {
      let campaigns = await loadJson<Campaign>(filePath);
      campaigns = campaigns.filter((c) => c.id !== id);
      await saveJson(filePath, campaigns);
    },

    async getChannelCampaigns(channelId) {
      const campaigns = await loadJson<Campaign>(filePath);
      return campaigns.filter((c) => c.channelId === channelId);
    },

    async nextSessionNumber(campaignId) {
      const campaigns = await loadJson<Campaign>(filePath);
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) return 1;
      campaign.sessionCounter += 1;
      await saveJson(filePath, campaigns);
      return campaign.sessionCounter;
    },

    async decrementSessionCounter(campaignId) {
      const campaigns = await loadJson<Campaign>(filePath);
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) return;
      campaign.sessionCounter = Math.max(0, campaign.sessionCounter - 1);
      await saveJson(filePath, campaigns);
    },
  };
}

// ── Factory ─────────────────────────────────────────────

export function createJsonStorage(
  sessionsFile: string,
  campaignsFile: string,
): StoragePort {
  return {
    sessions: createSessionStore(sessionsFile),
    campaigns: createCampaignStore(campaignsFile),
  };
}
