# TTRPG Discord App

A lightweight Discord bot for scheduling TTRPG sessions with automatic reminders.

## Features

- **`/session create`** — Schedule a new session with a title, date/time, and timezone
- **`/session list`** — View all upcoming sessions
- **`/session cancel`** — Cancel an upcoming session by ID
- **24-hour reminder** — Automatically pings `@everyone` one day before a session
- **Start reminder** — Pings `@everyone` when the session time arrives

## Setup

### 1. Create a Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** and give it a name
3. Go to **Bot** → click **Reset Token** → copy the token
4. Go to **OAuth2** → copy the **Client ID**
5. Under **Bot** → enable the **Server Members Intent** if you want `@everyone` pings to work

### 2. Invite the bot to your server

Generate an invite URL under **OAuth2 → URL Generator**:
- Scopes: `bot`, `applications.commands`
- Permissions: `Send Messages`, `Embed Links`, `Mention Everyone`

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your token and client ID
```

### 4. Install & Run

```bash
# Install dependencies
bun install

# Register slash commands (run once, or after changing commands)
bun run src/deploy-commands.ts

# Start the bot
bun run index.ts
```

## Usage

| Command | Description |
|---|---|
| `/session create title:"Session 12" date:"2026-03-15 19:00" timezone:"Europe/Rome"` | Schedule a session |
| `/session list` | Show upcoming sessions |
| `/session cancel id:"abc12345"` | Cancel a session |

## Guides

- [Recurring Sessions](docs/recurring-sessions.md) — set up automatic session scheduling for campaigns

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Bot framework:** [discord.js](https://discord.js.org) v14
- **Scheduler:** [node-cron](https://github.com/node-cron/node-cron)
- **Storage:** JSON file (lightweight, no database needed)
