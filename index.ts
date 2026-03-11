import {
  Client,
  GatewayIntentBits,
  Events,
  MessageFlags,
} from "discord.js";
import { CONFIG } from "./src/config";
import { execute as sessionExecute } from "./src/commands/session";
import { execute as campaignExecute } from "./src/commands/campaign";
import { startScheduler } from "./src/scheduler";
import { handleRsvpButton } from "./src/rsvp-handler.ts";
import { NatsAdapter } from "./src/messaging/nats-adapter";
import { startSessionCreateConsumer } from "./src/consumers/session-create";
import { startSessionCancelConsumer } from "./src/consumers/session-cancel";
import { startRsvpConsumers } from "./src/consumers/rsvp";
import { startCampaignConsumers } from "./src/consumers/campaign";
import type { MessagingPort } from "./src/messaging/port";
import { createJsonStorage } from "./src/storage";
import { initCampaignStore } from "./src/campaigns";
import { initSessionStore } from "./src/sessions";

if (!CONFIG.TOKEN) {
  console.error("❌ DISCORD_TOKEN is not set. Create a .env file (see .env.example).");
  process.exit(1);
}

// ── Storage ───────────────────────────────────────────────

const storage = createJsonStorage(CONFIG.SESSIONS_FILE, CONFIG.CAMPAIGNS_FILE);
initSessionStore(storage.sessions);
initCampaignStore(storage.campaigns);

// ── Messaging (optional — runs fine without NATS) ─────────

let messaging: MessagingPort | undefined;

if (CONFIG.NATS_URL) {
  const adapter = new NatsAdapter({ url: CONFIG.NATS_URL });
  try {
    await adapter.connect();
    messaging = adapter;
    console.log("[messaging] NATS adapter ready");
    await startSessionCreateConsumer(messaging);
    await startSessionCancelConsumer(messaging);
    await startCampaignConsumers(messaging);
  } catch (err) {
    console.error("[messaging] Failed to connect to NATS — events will not be published:", err);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  startScheduler(client, messaging);
  if (messaging) {
    await startRsvpConsumers(messaging, client);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Handle RSVP button clicks
  if (interaction.isButton()) {
    try {
      await handleRsvpButton(interaction, messaging);
    } catch (err) {
      console.error("[button] Error handling RSVP:", err);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "session") {
      await sessionExecute(interaction, messaging);
    } else if (interaction.commandName === "campaign") {
      await campaignExecute(interaction, messaging);
    } else {
      await interaction.reply({ content: "Unknown command.", flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    console.error(`[command] Error handling /${interaction.commandName}:`, err);
    const reply = {
      content: "⚠️ Something went wrong running that command.",
      flags: MessageFlags.Ephemeral,
    } as const;
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.login(CONFIG.TOKEN);