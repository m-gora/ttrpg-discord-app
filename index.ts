import {
  Client,
  GatewayIntentBits,
  Events,
  MessageFlags,
  Partials,
} from "discord.js";
import { CONFIG } from "./src/config";
import { execute as sessionExecute } from "./src/commands/session";
import { execute as campaignExecute } from "./src/commands/campaign";
import { startScheduler } from "./src/scheduler";
import { handleRsvpButton } from "./src/rsvp-handler.ts";

if (!CONFIG.TOKEN) {
  console.error("❌ DISCORD_TOKEN is not set. Create a .env file (see .env.example).");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
  ],
  partials: [
    Partials.Channel, // required to receive DM/group DM events
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  startScheduler(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Handle RSVP button clicks
  if (interaction.isButton()) {
    try {
      await handleRsvpButton(interaction);
    } catch (err) {
      console.error("[button] Error handling RSVP:", err);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "session") {
      await sessionExecute(interaction);
    } else if (interaction.commandName === "campaign") {
      await campaignExecute(interaction);
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