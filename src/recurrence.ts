/**
 * Compute the next session date by adding an ISO 8601 day-duration
 * (e.g. "P7D") to a reference date.
 *
 * The reference date should be the *original* (non-rescheduled) date of the
 * last session so that one-off reschedules don't drift the cadence.
 */
export function computeNextSessionDate(referenceIso: string, durationIso: string): string {
  const days = parseDurationDays(durationIso);
  if (days <= 0) throw new Error(`Invalid duration: ${durationIso}`);

  const next = new Date(referenceIso);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

/** Extract the number of days from a `PnD` duration string. Returns 0 on invalid input. */
export function parseDurationDays(iso: string): number {
  const match = /^P(\d+)D$/.exec(iso);
  return match ? Number(match[1]) : 0;
}

/** Format an ISO 8601 duration into a human-readable string */
export function formatDuration(iso: string): string {
  const match = /^P(\d+)D$/.exec(iso);
  if (!match) return iso;
  const days = Number(match[1]);
  if (days === 7) return "week";
  if (days === 14) return "2 weeks";
  if (days % 7 === 0) return `${days / 7} weeks`;
  return `${days} days`;
}
