/**
 * Format an ISO timestamp in Eastern Time, regardless of where the code runs.
 *
 * Why this exists:
 * `new Date(iso).toLocaleString()` uses the runtime's local timezone, which
 * means SERVER-rendered components on Vercel display in UTC while
 * CLIENT-rendered components display in the user's local time. This causes
 * confusing inconsistency where the same timestamp shows different times on
 * different admin pages.
 *
 * All admin date displays should use these helpers to guarantee Eastern Time
 * everywhere, server- and client-side.
 *
 * Display contract: Eastern (America/New_York), automatically handles DST.
 * All dates stored in DB as UTC (ISO timestamps), displayed in Eastern.
 */

export function formatEastern(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function formatEasternDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatEasternTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
