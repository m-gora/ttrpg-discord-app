# Recurring Sessions — User Guide

Campaigns can automatically create the next session after each one finishes. Instead of manually scheduling every week, you set a **recurrence** (in days) on the campaign and the bot handles the rest.

## Setting up recurrence

### On a new campaign

```
/campaign create name:"Curse of Strahd" players:5 recurrence:7
```

This creates a weekly campaign. Use `14` for biweekly, or any number of days.

### On an existing campaign

```
/campaign edit id:<campaign-id> recurrence:7
```

No migration needed — existing campaigns without recurrence keep working as before. The next auto-created session starts after the last session in that campaign is cleaned up.

### Disabling recurrence

```
/campaign edit id:<campaign-id> recurrence:0
```

This stops the automatic creation of follow-up sessions. Any session already scheduled stays as is.

---

## How it works

1. A session finishes and is cleaned up by the bot (~1 hour after its scheduled time).
2. The bot checks if the campaign has a recurrence set.
3. If there are **no other upcoming sessions** for that campaign, the bot automatically creates the next one at `session date + recurrence period`.
4. The new session gets its own card with Attend/Decline buttons, just like a manually created one.

---

## Common scenarios

### Weekly game with nothing special

Your campaign recurs every 7 days. Each Tuesday at 19:00, a session plays. After cleanup, the next Tuesday session is created automatically.

### Two sessions already scheduled

You enable recurrence on a campaign that already has Session 5 (March 15) and Session 6 (March 22) lined up.

- Session 5 finishes → the bot sees Session 6 already exists → **skips auto-create**
- Session 6 finishes → no upcoming sessions left → auto-creates Session 7 for March 29

Pre-existing sessions drain naturally. No duplicates.

### Spontaneous extra session

Everyone is free tomorrow and wants to play, even though the regular session is 3 days away.

1. Manually create a session: `/session create campaign:<id> date:"2026-03-12 19:00"`
2. The spontaneous session finishes → the bot sees the regular session still exists → **skips auto-create**
3. The regular session finishes → auto-creates the next one on the normal cadence

Spontaneous sessions slot in without disrupting the recurring schedule.

### Session rescheduled via poll

Someone declines, a reschedule poll runs, and the session moves from Tuesday to Thursday.

- The bot remembers the **original date** (Tuesday) and uses that for the next recurrence calculation.
- After the Thursday session is cleaned up: `original Tuesday + 7 days = next Tuesday`
- The cadence stays on Tuesdays. One-off reschedules don't cause drift.

### Switching to a different day

The party decides Tuesdays don't work anymore and wants to play on Thursdays instead.

1. Cancel the upcoming Tuesday session (if any): `/session cancel id:<session-id>`
2. Create a session on the new day: `/session create campaign:<id> date:"2026-03-19 19:00"`
3. The recurrence period stays the same (or update it with `/campaign edit` if needed)

From now on, sessions auto-create anchored to Thursday. No need to disable and re-enable recurrence — the new session's date becomes the anchor.

### Changing the cadence

The party wants to switch from weekly to biweekly:

```
/campaign edit id:<campaign-id> recurrence:14
```

Takes effect on the **next** auto-created session. The currently scheduled session is unaffected.

### Deleting a campaign

Deleting a campaign stops recurrence immediately — there's no campaign to read the recurrence from. Any session already scheduled remains but won't spawn a follow-up.
