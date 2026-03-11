# TTRPG Discord App — Architecture Documentation (arc42)

## 1. Introduction and Goals

### 1.1 Requirements Overview

A Discord bot for scheduling and managing tabletop RPG sessions. It serves small gaming groups who need a lightweight way to coordinate game nights without leaving Discord.

| Requirement | Description |
|---|---|
| **Session scheduling** | Create, list, and cancel sessions with timezone-aware date/time |
| **Campaign management** | Register campaigns with VTT links, player counts, and timezone |
| **RSVP tracking** | Interactive attend/decline buttons with live counts on the session card |
| **Automated reminders** | 24-hour and start-time reminders, auto-sent by a background scheduler |
| **Reschedule polls** | When a player declines, a native Discord poll opens with alternative dates |
| **Session cleanup** | Old sessions are automatically removed 1 hour after start |

### 1.2 Quality Goals

| Priority | Goal | Measure |
|---|---|---|
| 1 | **Reliability** | Reminders must fire even after pod restarts; events are durable |
| 2 | **Simplicity** | Minimal dependencies; single-binary deployment; no database server required |
| 3 | **Small footprint** | Distroless container image (~30 MB); low resource usage (50m CPU / 128 Mi RAM) |
| 4 | **Graceful degradation** | Bot remains functional if NATS is unavailable |

### 1.3 Stakeholders

| Role | Expectations |
|---|---|
| Players | Receive timely reminders and easy RSVP interaction |
| Game Master | Simple session/campaign setup via slash commands |
| Operator | Low maintenance, small resource footprint, easy deployment |

---

## 2. Constraints

### 2.1 Technical Constraints

| Constraint | Explanation |
|---|---|
| Single replica | Discord enforces one gateway connection per bot token |
| Bun runtime | Used for fast startup, built-in SQLite, and TypeScript-native execution |
| Distroless image | No shell available in production — limits debugging but reduces attack surface |
| NATS JetStream | Chosen for durable event delivery; optional dependency |

### 2.2 Organisational Constraints

| Constraint | Explanation |
|---|---|
| Self-hosted | Runs on a personal Kubernetes cluster |
| No external database | Persistence via JSON files or Bun's built-in SQLite (`bun:sqlite`) |

---

## 3. Context and Scope

### 3.1 Business Context

```
┌───────────────┐         slash commands          ┌───────────────────────┐
│               │ ──────────────────────────────▶  │                       │
│  Discord      │         button clicks            │  TTRPG Discord App    │
│  Users        │ ──────────────────────────────▶  │                       │
│               │  ◀──────────────────────────────  │                       │
│               │    embeds, reminders, polls       │                       │
└───────────────┘                                  └───────────────────────┘
```

| Actor | Interaction |
|---|---|
| **Discord Users** | Create/cancel sessions and campaigns via `/session` and `/campaign` slash commands; click Attend/Decline buttons on session cards; vote in reschedule polls |
| **TTRPG Discord App** | Sends session cards, reminders, reschedule polls; manages state |

### 3.2 Technical Context

```
┌──────────────────────────────────────────────────────────────────────┐
│  Kubernetes Cluster — namespace: ttrpg                               │
│                                                                      │
│  ┌─────────────────────────────┐      ┌────────────────────────┐    │
│  │  Deployment                 │      │  StatefulSet            │    │
│  │  ttrpg-discord-app          │      │  nats                   │    │
│  │  ┌───────────────────────┐  │ TCP  │  ┌──────────────────┐  │    │
│  │  │  Bot Container        │──┼──────┼─▶│  NATS Server     │  │    │
│  │  │  (bun:distroless)     │  │ 4222 │  │  + JetStream     │  │    │
│  │  └──────────┬────────────┘  │      │  └──────────────────┘  │    │
│  │             │               │      │           │             │    │
│  │        ┌────▼────┐          │      │     ┌─────▼─────┐      │    │
│  │        │  PVC    │          │      │     │  PVC      │      │    │
│  │        │ /data   │          │      │     │ /data     │      │    │
│  │        │ 64 Mi   │          │      │     │ 1 Gi      │      │    │
│  │        └─────────┘          │      │     └───────────┘      │    │
│  └─────────────────────────────┘      └────────────────────────┘    │
│                                                                      │
│  ConfigMap: ttrpg-discord-app-conf     Secret: ttrpg-discord-app    │
└───────────────────────┬──────────────────────────────────────────────┘
                        │
                        │ HTTPS (WebSocket + REST)
                        ▼
               ┌─────────────────┐
               │  Discord API    │
               │  Gateway + REST │
               └─────────────────┘
```

| Interface | Protocol | Purpose |
|---|---|---|
| **Discord Gateway** | WSS | Real-time events (commands, button interactions) |
| **Discord REST API v10** | HTTPS | Command registration, message editing via webhooks |
| **NATS JetStream** | TCP :4222 | Durable event publishing and subscribing |
| **PVC (bot)** | Filesystem | `sessions.json`, `campaigns.json` |
| **PVC (NATS)** | Filesystem | JetStream data store |

---

## 4. Solution Strategy

| Strategy | Implementation |
|---|---|
| **Hexagonal architecture** | Core logic depends on port interfaces (`MessagingPort`, `StoragePort`); adapters handle infrastructure |
| **Event-driven processing** | User actions publish `*.requested` events; consumers handle side effects asynchronously |
| **Durable messaging** | NATS JetStream replays unprocessed events after restarts |
| **Graceful degradation** | NATS is optional — the bot starts and runs without it using local JSON files |
| **Deferred webhook replies** | Interaction responses are deferred; consumers edit the original reply via Discord's webhook API |
| **Cron-based scheduling** | A 60-second cron job checks reminders, poll results, and session cleanup |

---

## 5. Building Block View

### 5.1 Level 1 — System Decomposition

```
┌─────────────────────────────────────────────────────────────────┐
│  index.ts (Composition Root)                                     │
│                                                                  │
│  ┌───────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Commands      │  │  RSVP Handler│  │  Scheduler            │ │
│  │  /session      │  │  Button      │  │  (node-cron, 60s)     │ │
│  │  /campaign     │  │  interactions│  │  • checkReminders()   │ │
│  └──────┬────────┘  └──────┬───────┘  │  • checkReschedulePolls│ │
│         │                  │          └──────────┬────────────┘ │
│         ▼                  ▼                     ▼              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Messaging Port                                           │   │
│  │  publish() / subscribe()                                  │   │
│  └───────────────────────────┬──────────────────────────────┘   │
│                              │                                   │
│  ┌───────────────────────────▼──────────────────────────────┐   │
│  │  Consumers                                                │   │
│  │  session-create │ session-cancel │ rsvp │ campaign         │   │
│  └───────────────────────────┬──────────────────────────────┘   │
│                              │                                   │
│  ┌───────────────────────────▼──────────────────────────────┐   │
│  │  Storage (sessions.ts / campaigns.ts)                     │   │
│  │  JSON adapter  │  SQLite adapter                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Level 2 — Source Layout

```
index.ts                           Composition root, Discord client setup
src/
├── config.ts                      Environment variable parsing
├── sessions.ts                    Session model + CRUD (delegates to storage)
├── campaigns.ts                   Campaign model + CRUD
├── session-card.ts                Discord embed + button builder
├── rsvp-handler.ts                Button click → publish RSVP event
├── scheduler.ts                   Cron: reminders, poll results, cleanup
├── reschedule-poll.ts             Discord poll creation + tallying
├── deploy-commands.ts             One-shot slash command registration
├── commands/
│   ├── session.ts                 /session create | list | cancel
│   └── campaign.ts                /campaign create | edit | list | delete
├── consumers/
│   ├── session-create.ts          Handles session.create.requested
│   ├── session-cancel.ts          Handles session.cancel.requested
│   ├── rsvp.ts                    Handles rsvp.attend/decline.requested
│   └── campaign.ts                Handles campaign.create/edit/delete.requested
├── messaging/
│   ├── port.ts                    MessagingPort interface
│   ├── events.ts                  Subject constants + event type definitions
│   ├── nats-adapter.ts            NATS JetStream adapter
│   └── index.ts                   Re-exports
└── storage/
    ├── port.ts                    StoragePort, SessionStore, CampaignStore interfaces
    ├── json-adapter.ts            JSON file adapter
    ├── sqlite-adapter.ts          SQLite adapter (bun:sqlite)
    └── index.ts                   Re-exports
```

---

## 6. Runtime View

### 6.1 Session Creation

```
User                 Command Handler       NATS JetStream       Consumer            Storage
 │                        │                     │                   │                  │
 │ /session create        │                     │                   │                  │
 │───────────────────────▶│                     │                   │                  │
 │                        │ validate + parse TZ │                   │                  │
 │                        │ deferReply()        │                   │                  │
 │                        │                     │                   │                  │
 │                        │ session.create.requested                │                  │
 │                        │────────────────────▶│                   │                  │
 │                        │                     │ deliver           │                  │
 │                        │                     │──────────────────▶│                  │
 │                        │                     │                   │ addSession()     │
 │                        │                     │                   │────────────────▶│
 │                        │                     │                   │                  │
 │                        │                     │                   │ edit deferred    │
 │◀─────────────────────────────────────────────────────────────────│ reply (webhook)  │
 │    session card embed  │                     │                   │                  │
 │                        │                     │◀──────────────────│ session.created  │
 │                        │                     │      ack          │                  │
```

### 6.2 RSVP Attend → Card Update

```
User                 RSVP Handler          NATS JetStream       Consumer            Storage
 │                        │                     │                   │                  │
 │ [Attend] button click  │                     │                   │                  │
 │───────────────────────▶│                     │                   │                  │
 │                        │ deferUpdate()       │                   │                  │
 │                        │ rsvp.attend.requested                   │                  │
 │                        │────────────────────▶│                   │                  │
 │                        │                     │──────────────────▶│                  │
 │                        │                     │                   │ add to rsvps[]   │
 │                        │                     │                   │────────────────▶│
 │                        │                     │                   │                  │
 │                        │                     │                   │ rebuild card     │
 │◀─────────────────────────────────────────────────────────────────│ edit via webhook │
 │   updated session card │                     │                   │                  │
```

### 6.3 First Decline → Reschedule Poll

```
User                 RSVP Handler          Consumer             Scheduler           Channel
 │                        │                   │                     │                  │
 │ [Can't Make It] click  │                   │                     │                  │
 │───────────────────────▶│                   │                     │                  │
 │                        │──── rsvp.decline.requested ───────────▶│                  │
 │                        │                   │ first decline?      │                  │
 │                        │                   │ openReschedulePoll()│                  │
 │                        │                   │─────────────────────────────────────▶│
 │◀──────────────────────────────────────────────────────────────── │ Discord poll     │
 │                        │                   │                     │  (24h, 7 options)│
 │                        │                   │                     │                  │
 │    ... 24 hours pass ...                   │                     │                  │
 │                        │                   │                     │ poll finalized   │
 │                        │                   │                     │ tally votes      │
 │                        │                   │                     │ update session   │
 │◀──────────────────────────────────────────────────────────────── │ "Rescheduled!"   │
```

### 6.4 Reminder Flow (Scheduler)

```
           Scheduler (every 60s)                          Discord Channel
                    │                                           │
                    │ load all sessions                         │
                    │ for each session:                         │
                    │   timeUntil = sessionTime - now            │
                    │                                           │
                    │── if ≤ 24h && !reminded24h ──────────────▶│ ⏰ Session Tomorrow!
                    │   set reminded24h = true                  │ @everyone
                    │                                           │
                    │── if ≤ 0 && !remindedStart ─────────────▶│ 🎲 Session Starting Now!
                    │   set remindedStart = true                │ @rsvp mentions + VTT link
                    │                                           │
                    │── if < -1h ────────────────────────────── │ (cleanup: remove session)
                    │                                           │
```

---

## 7. Deployment View

### 7.1 Infrastructure

```
┌─────────────────────────────────────────────────────────────────────┐
│  Kubernetes Namespace: ttrpg                                         │
│                                                                      │
│  ┌──────────────────────────────────────┐                           │
│  │  Deployment: ttrpg-discord-app       │                           │
│  │  Replicas: 1 (Recreate strategy)     │                           │
│  │                                      │                           │
│  │  Container: bot                      │                           │
│  │  Image: ghcr.io/m-gora/ttrpg-       │                           │
│  │         discord-app:<tag>            │                           │
│  │  Runtime: oven/bun:1-distroless      │                           │
│  │                                      │                           │
│  │  Env:                                │                           │
│  │   ├─ Secret: DISCORD_TOKEN,          │                           │
│  │   │         DISCORD_CLIENT_ID        │                           │
│  │   └─ ConfigMap: SESSIONS_FILE,       │                           │
│  │       CAMPAIGNS_FILE, NATS_URL,      │                           │
│  │       DEFAULT_TIMEZONE               │                           │
│  │                                      │                           │
│  │  Volume: /data (PVC 64 Mi RWO)       │                           │
│  │   ├─ sessions.json                   │                           │
│  │   └─ campaigns.json                  │                           │
│  │                                      │                           │
│  │  Resources:                          │                           │
│  │   req: 50m CPU / 128 Mi RAM          │                           │
│  │   lim: 200m CPU / 256 Mi RAM         │                           │
│  │                                      │                           │
│  │  Security:                           │                           │
│  │   runAsNonRoot, readOnlyRootFS,      │                           │
│  │   no caps, seccomp: RuntimeDefault   │                           │
│  └──────────────────────────────────────┘                           │
│                                                                      │
│  ┌──────────────────────────────────────┐                           │
│  │  StatefulSet: nats                   │                           │
│  │  Replicas: 1                         │                           │
│  │  Image: nats:2.12.4                  │                           │
│  │                                      │                           │
│  │  JetStream:                          │                           │
│  │   max_mem: 64 MB, max_file: 512 MB   │                           │
│  │                                      │                           │
│  │  Service: nats (headless)            │                           │
│  │   Ports: 4222 (client), 8222 (HTTP)  │                           │
│  │                                      │                           │
│  │  Volume: /data (PVC 1 Gi RWO)        │                           │
│  │                                      │                           │
│  │  Probes:                             │                           │
│  │   liveness:  /healthz                │                           │
│  │   readiness: /healthz?js-enabled-only│                           │
│  └──────────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Container Build

```
Stage 1: deps (oven/bun:1)
  └─ bun install --frozen-lockfile --production

Stage 2: runtime (oven/bun:1-distroless)
  └─ COPY node_modules, package.json, tsconfig.json, index.ts, src/
  └─ USER 65534 (non-root)
  └─ CMD ["index.ts"]
```

Final image: ~30 MB, no shell, no package manager.

---

## 8. Crosscutting Concepts

### 8.1 Event Subjects

All events flow through a single NATS JetStream stream (`TTRPG_EVENTS`):

| Subject | Direction | Description |
|---|---|---|
| `session.create.requested` | Command → Consumer | User wants to create a session |
| `session.created` | Consumer → (downstream) | Session persisted and card posted |
| `session.cancel.requested` | Command → Consumer | User wants to cancel a session |
| `session.cancelled` | Consumer → (downstream) | Session removed |
| `session.rescheduled` | Scheduler → (downstream) | Poll resolved, new date set |
| `session.cleaned_up` | Scheduler → (downstream) | Old session auto-removed |
| `rsvp.attend.requested` | Button → Consumer | User clicked Attend |
| `rsvp.attended` | Consumer → (downstream) | RSVP recorded |
| `rsvp.decline.requested` | Button → Consumer | User clicked Decline |
| `rsvp.declined` | Consumer → (downstream) | Decline recorded |
| `reschedule.poll_opened` | Consumer → (downstream) | Reschedule poll created |
| `reschedule.poll_resolved` | Scheduler → (downstream) | Poll ended, winner picked |
| `reminder.24h_sent` | Scheduler → (downstream) | 24h reminder delivered |
| `reminder.start_sent` | Scheduler → (downstream) | Start reminder delivered |
| `campaign.create.requested` | Command → Consumer | User wants to create a campaign |
| `campaign.created` | Consumer → (downstream) | Campaign persisted |
| `campaign.edit.requested` | Command → Consumer | User wants to edit a campaign |
| `campaign.updated` | Consumer → (downstream) | Campaign updated |
| `campaign.delete.requested` | Command → Consumer | User wants to delete a campaign |
| `campaign.deleted` | Consumer → (downstream) | Campaign removed |

### 8.2 Timezone Handling

1. User provides time as `YYYY-MM-DD HH:mm` + IANA timezone
2. `parseDateInTZ()` converts to UTC using `Intl.DateTimeFormat` (iterative offset correction)
3. Stored as ISO-8601 UTC string (e.g. `2026-03-15T19:00:00.000Z`)
4. Displayed via Discord's `time()` helper which auto-converts to the viewer's local timezone
5. Timezone resolution priority: explicit command option → campaign setting → `DEFAULT_TIMEZONE` env var

### 8.3 Idempotency

- RSVP buttons check if the user is already in `rsvps[]` or `declined[]` before modifying state
- NATS consumers use durable names — duplicate delivery triggers the same check
- Reminder flags (`reminded24h`, `remindedStart`) prevent duplicate sends — only set after successful delivery

### 8.4 Error Handling

| Layer | Strategy |
|---|---|
| Commands | `try/catch` → ephemeral error reply to user |
| Consumers | `try/catch` → NATS `nak()` for redelivery |
| Scheduler | `try/catch` per session → log error, continue to next session |
| Channel resolution | Failure → log warning, skip (retry next cycle for reminders) |
| NATS connection | Failure → log, continue without messaging (graceful degradation) |
| Stream setup | Failure → log warning, continue (stream may already exist) |

### 8.5 Security

- Distroless container — no shell, no package manager
- Non-root user (UID 65534)
- Read-only root filesystem
- All Linux capabilities dropped
- Seccomp profile: `RuntimeDefault`
- `automountServiceAccountToken: false`
- Discord token stored in Kubernetes Secret (managed out-of-band)

---

## 9. Architecture Decisions

### ADR-1: Single-Replica Deployment

**Context:** Discord's gateway enforces one WebSocket connection per bot token.

**Decision:** Deploy as a single replica with `Recreate` strategy.

**Consequence:** No high availability. Acceptable for a gaming-group bot; brief downtime during rollouts.

### ADR-2: NATS JetStream for Messaging

**Context:** Need durable event delivery so that events produced during interaction handling are not lost if the consumer crashes.

**Decision:** Use NATS JetStream with durable consumers and `DeliverPolicy.All` for replay.

**Consequence:** Events survive restarts. Added operational complexity of running NATS. Mitigated by making NATS optional — bot works without it.

### ADR-3: Hexagonal Architecture (Ports & Adapters)

**Context:** Want to support multiple storage backends (JSON for dev, SQLite for prod) and potentially swap messaging (NATS today, Redis tomorrow).

**Decision:** Define `MessagingPort` and `StoragePort` interfaces. Adapters implement these.

**Consequence:** Core logic is infrastructure-agnostic. New adapters can be added without changing business logic.

### ADR-4: Deferred Webhook Replies

**Context:** Discord interactions have a 3-second response window. Consumer processing may exceed this.

**Decision:** Immediately `deferReply()` / `deferUpdate()`, then consumers edit the deferred response via Discord's webhook API.

**Consequence:** No timeout errors. Works across restarts since the webhook token is passed through the event.

### ADR-5: Bun Distroless Runtime

**Context:** Want minimal image size and fast startup for a low-resource deployment.

**Decision:** Use `oven/bun:1-distroless` (~30 MB image), native TypeScript execution, built-in SQLite.

**Consequence:** Fast cold starts. No shell available for debugging — requires ephemeral debug containers or temporary pods with PVC mounts.

### ADR-6: Cron-Based Scheduler Over Discord Scheduled Events

**Context:** Need reliable reminder delivery that works regardless of Discord's scheduled events feature availability.

**Decision:** Use `node-cron` running every 60 seconds, checking all sessions against `Date.now()`.

**Consequence:** Predictable, testable, works offline. Maximum delivery delay is 60 seconds.

---

## 10. Quality Requirements

### 10.1 Quality Tree

```
Quality
├── Reliability
│   ├── Reminders fire after restart (durable flags)
│   ├── Events replayed on reconnect (NATS JetStream)
│   └── Failed sends retry next cycle (no flag until success)
├── Simplicity
│   ├── 3 runtime dependencies (discord.js, nats, node-cron)
│   ├── No external database required
│   └── Single entry point (index.ts)
├── Performance
│   ├── ~30 MB container image
│   ├── 50m CPU / 128 Mi RAM baseline
│   └── Sub-second command response (deferred)
└── Security
    ├── Distroless (no shell)
    ├── Non-root, read-only FS, no caps
    └── Secrets managed out-of-band
```

---

## 11. Risks and Technical Debt

| Risk / Debt | Impact | Mitigation |
|---|---|---|
| Single replica = no HA | Bot offline during rollouts (~10s) | `Recreate` strategy minimises dual-instance window |
| JSON file storage lacks atomicity | Concurrent writes could corrupt state | Single replica prevents concurrency; SQLite adapter available |
| `guildId` empty for DM sessions | Channel resolution and `getUpcomingSessions` may not work | Ensure sessions are created in guild context |
| PVC size limits | NATS JetStream `insufficient storage` errors | Sized PVC to 1 Gi with 512 MB JetStream file limit |
| Distroless limits debugging | Cannot exec into container | Use ephemeral debug containers or temporary PVC-mounting pods |
| 60-second scheduler granularity | Reminders can be up to 60s late | Acceptable for a TTRPG scheduling bot |

---

## 12. Glossary

| Term | Definition |
|---|---|
| **Session** | A scheduled TTRPG game event with date, title, RSVPs, and reminders |
| **Campaign** | A named game series with VTT link, player count, timezone, and session counter |
| **Session Card** | A Discord embed with session details and Attend/Decline buttons |
| **RSVP** | A player's response (attend or decline) to a session |
| **Reschedule Poll** | A 24-hour Discord native poll with 7 alternative dates |
| **VTT** | Virtual tabletop (e.g. Foundry VTT, Roll20) |
| **NATS JetStream** | Durable message streaming layer built into NATS |
| **Consumer** | An async event handler subscribed to a NATS subject |
| **Port** | An interface defining a boundary between core logic and infrastructure |
| **Adapter** | An implementation of a port for a specific technology |
| **Distroless** | A minimal container image containing only the application runtime, no OS tools |
