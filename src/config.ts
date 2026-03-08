export const CONFIG = {
  /** Discord bot token */
  TOKEN: process.env.DISCORD_TOKEN ?? "",
  /** Discord application (client) ID */
  CLIENT_ID: process.env.DISCORD_CLIENT_ID ?? "",
  /** Optional: restrict command registration to a single guild for faster updates */
  GUILD_ID: process.env.DISCORD_GUILD_ID ?? "",
  /** Path to the JSON file used as a lightweight session store */
  SESSIONS_FILE: process.env.SESSIONS_FILE ?? "./sessions.json",
  /** Path to the JSON file used as a lightweight campaign store */
  CAMPAIGNS_FILE: process.env.CAMPAIGNS_FILE ?? "./campaigns.json",
  /** NATS server URL (set to empty string to disable event publishing) */
  NATS_URL: process.env.NATS_URL ?? "",
} as const;
