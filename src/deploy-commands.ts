/**
 * Run this script once (or whenever you change command definitions) to register
 * slash commands with Discord.
 *
 *   bun run src/deploy-commands.ts
 */
import { REST, Routes } from "discord.js";
import { CONFIG } from "./config";
import { data as sessionCommand } from "./commands/session";
import { data as campaignCommand } from "./commands/campaign";

const commands = [sessionCommand.toJSON(), campaignCommand.toJSON()];

const rest = new REST({ version: "10" }).setToken(CONFIG.TOKEN);

async function main() {
  console.log(`Registering ${commands.length} slash command(s)…`);

  if (CONFIG.GUILD_ID) {
    // Guild-scoped commands update instantly – great for development
    await rest.put(
      Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.GUILD_ID),
      { body: commands },
    );
    console.log(`✅ Registered commands for guild ${CONFIG.GUILD_ID}`);
  } else {
    // Global commands can take up to 1 hour to propagate
    await rest.put(Routes.applicationCommands(CONFIG.CLIENT_ID), {
      body: commands,
    });
    console.log("✅ Registered global commands (may take up to 1h to appear)");
  }
}

await main();
