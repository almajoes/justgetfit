import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Analytics query helpers
 *
 * Strategy:
 *   - "Now" / "Today" / "Yesterday" → query raw `pageviews` table directly.
 *     Includes full breakdowns (referrer, country, device).
 *   - "Last 7 days" / "Last 30 days" → query `analytics_daily` for speed.
 *     Path-level only (no referrer/country/device breakdown for those ranges).
 *
 * All counts filter `is_bot = false` so dashboard reflects real human traffic.
 *
 * TIMEZONE — IMPORTANT
 * --------------------
 * All date/hour boundaries and labels are computed in America/New_York
 * (Eastern Time). The owner is in Eastern, so "Today" should mean "today in
 * Eastern" not "today in UTC" — otherwise data from 8pm-midnight Eastern would
 * get bundled into the next day from the dashboard's perspective.
 *
 * The `pageviews.created_at` column stores UTC timestamps (Postgres
 * timestamptz default). We convert to Eastern only at boundary computation
 * and display time. Storage stays UTC for portability — if we ever need to
 * re-bucket by a different timezone later, the raw data supports it.
 *
 * DST is handled automatically via Intl.DateTimeFormat with timeZone option.
 * No manual offset arithmetic needed.
 */

const TIMEZONE = 'America/New_York';

export type RangeKey = 'now' | 'today' | 'yesterday' | '7d' | '30d';

export type RangeBounds = {
  startIso: string;
  endIso: string;
  /** 'raw' = query pageviews; 'aggregate' = query analytics_daily */
  source: 'raw' | 'aggregate';
};

/**
 * Get the current date/time components in Eastern Time. Returns an object
 * with year/month/day/hour fields. Used to compute "today midnight Eastern"
 * as a UTC instant for query boundaries.
 */
function nowInEastern(): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value || '0', 10);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') === 24 ? 0 : get('hour'), // hour12:false sometimes returns 24
  };
}

/**
 * Convert "midnight on YYYY-MM-DD in Eastern Time" to a UTC ISO string.
 * Used to compute the start of "today" or "yesterday" in Eastern as a
 * UTC instant we can feed into a SQL query.
 *
 * Approach: format a fake UTC date with the target Eastern timezone, then
 * compute the offset and apply it. Slightly roundabout but handles DST
 * correctly without depending on a date library.
 */
function easternMidnightToUTC(year: number, month: number, day: number): Date {
  // Start with a guess at midnight UTC for that date
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  // What Eastern time does that UTC instant correspond to?
  const easternParts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(utcGuess);
  const eHour = parseInt(easternParts.find((p) => p.type === 'hour')?.value || '0', 10);
  const eMin = parseInt(easternParts.find((p) => p.type === 'minute')?.value || '0', 10);
  // The offset (in minutes) we need to add to UTC midnight to land on Eastern midnight.
  // If Eastern is currently showing 20:00 for our UTC guess, we need to add 4 hours
  // to make Eastern show 00:00 (which means midnight Eastern is 04:00 UTC).
  const easternMinsAfterUTCMidnight = eHour * 60 + eMin;
  // If Eastern says 20:00 when UTC says 00:00, Eastern midnight = UTC + (24*60 - 20*60) = UTC + 4h
  const offsetMins = (24 * 60 - easternMinsAfterUTCMidnight) % (24 * 60);
  return new Date(utcGuess.getTime() + offsetMins * 60 * 1000);
}

/**
 * Compute the time bounds for a given range, in Eastern Time semantics but
 * returned as UTC ISO strings for SQL.
 */
export function getRangeBounds(range: RangeKey): RangeBounds {
  const now = new Date();
  if (range === 'now') {
    const start = new Date(now.getTime() - 5 * 60 * 1000);
    return { startIso: start.toISOString(), endIso: now.toISOString(), source: 'raw' };
  }

  const e = nowInEastern();

  if (range === 'today') {
    const start = easternMidnightToUTC(e.year, e.month, e.day);
    return { startIso: start.toISOString(), endIso: now.toISOString(), source: 'raw' };
  }
  if (range === 'yesterday') {
    // Yesterday in Eastern: subtract 1 day from Eastern's "today" date
    const yesterdayDate = new Date(Date.UTC(e.year, e.month - 1, e.day - 1));
    const yYear = yesterdayDate.getUTCFullYear();
    const yMonth = yesterdayDate.getUTCMonth() + 1;
    const yDay = yesterdayDate.getUTCDate();
    const start = easternMidnightToUTC(yYear, yMonth, yDay);
    const end = easternMidnightToUTC(e.year, e.month, e.day);
    return { startIso: start.toISOString(), endIso: end.toISOString(), source: 'raw' };
  }
  if (range === '7d') {
    const end = easternMidnightToUTC(e.year, e.month, e.day);
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { startIso: start.toISOString(), endIso: end.toISOString(), source: 'aggregate' };
  }
  // 30d
  const end = easternMidnightToUTC(e.year, e.month, e.day);
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString(), source: 'aggregate' };
}

export type Stats = {
  pageviews: number;
  unique_visitors: number;
  total_sessions: number;
};

export type TopRow = {
  label: string;
  count: number;
};

export type AnalyticsSnapshot = {
  range: RangeKey;
  stats: Stats;
  // Breakdowns — only populated when source is 'raw'. For aggregate ranges
  // (7d/30d), only `topPaths` is populated; rest are empty arrays.
  topPaths: TopRow[];
  topReferrers: TopRow[];
  topCountries: TopRow[];
  deviceBreakdown: TopRow[];
  /** Hourly buckets for "today"/"yesterday", daily buckets for 7d/30d.
   * Each entry has a label (e.g. "14:00 ET" or "Apr 25") and a pageview count. */
  timeline: TopRow[];
};

export async function getAnalyticsSnapshot(range: RangeKey): Promise<AnalyticsSnapshot> {
  const bounds = getRangeBounds(range);

  if (bounds.source === 'raw') {
    return getRawSnapshot(range, bounds);
  }
  return getAggregateSnapshot(range, bounds);
}

// ─── Raw pageviews snapshot (now/today/yesterday) ─────────────────────────
async function getRawSnapshot(range: RangeKey, bounds: RangeBounds): Promise<AnalyticsSnapshot> {
  const { data: rows, error } = await supabaseAdmin
    .from('pageviews')
    .select('path, referrer_domain, country, device_type, visitor_hash, session_id, created_at')
    .eq('is_bot', false)
    .gte('created_at', bounds.startIso)
    .lte('created_at', bounds.endIso);

  if (error) {
    console.error('[analytics] raw fetch failed:', error);
    return emptySnapshot(range);
  }

  const all = rows || [];

  const visitors = new Set<string>();
  const sessions = new Set<string>();
  for (const r of all) {
    visitors.add(r.visitor_hash);
    if (r.session_id) sessions.add(r.session_id);
  }

  const pathCounts = new Map<string, number>();
  const referrerCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const deviceCounts = new Map<string, number>();

  for (const r of all) {
    pathCounts.set(r.path, (pathCounts.get(r.path) || 0) + 1);
    if (r.referrer_domain) {
      referrerCounts.set(r.referrer_domain, (referrerCounts.get(r.referrer_domain) || 0) + 1);
    }
    if (r.country) {
      countryCounts.set(r.country, (countryCounts.get(r.country) || 0) + 1);
    }
    if (r.device_type) {
      deviceCounts.set(r.device_type, (deviceCounts.get(r.device_type) || 0) + 1);
    }
  }

  const timeline = buildRawTimeline(range, all, bounds);

  return {
    range,
    stats: {
      pageviews: all.length,
      unique_visitors: visitors.size,
      total_sessions: sessions.size,
    },
    topPaths: topN(pathCounts, 10),
    topReferrers: topN(referrerCounts, 10),
    topCountries: topN(countryCounts, 10),
    deviceBreakdown: topN(deviceCounts, 5),
    timeline,
  };
}

/**
 * Convert a UTC timestamp string to its Eastern-Time hour (0-23).
 * Used for hourly bucketing.
 */
function easternHourOf(utcIso: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcIso));
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  return h === 24 ? 0 : h;
}

function buildRawTimeline(
  range: RangeKey,
  rows: Array<{ created_at: string }>,
  bounds: RangeBounds
): TopRow[] {
  if (range === 'now') {
    // 5 buckets of 1 minute each — these are minute-granular so timezone
    // doesn't matter for labeling
    const buckets = new Array(5).fill(0).map((_, i) => ({
      label: `-${4 - i}m`,
      count: 0,
    }));
    const start = new Date(bounds.startIso).getTime();
    for (const r of rows) {
      const ts = new Date(r.created_at).getTime();
      const bucket = Math.min(4, Math.floor((ts - start) / (60 * 1000)));
      if (bucket >= 0 && bucket < 5) buckets[bucket].count++;
    }
    return buckets;
  }

  // Hourly buckets in Eastern Time for today/yesterday
  const buckets = new Array(24).fill(0).map((_, h) => ({
    label: String(h).padStart(2, '0') + ':00',
    count: 0,
  }));
  for (const r of rows) {
    const h = easternHourOf(r.created_at);
    if (h >= 0 && h < 24) buckets[h].count++;
  }

  // For "today", trim trailing empty hours past current Eastern hour
  if (range === 'today') {
    const currentHourEastern = nowInEastern().hour;
    return buckets.slice(0, currentHourEastern + 1);
  }
  return buckets;
}

// ─── Aggregate snapshot (7d/30d) ──────────────────────────────────────────
async function getAggregateSnapshot(range: RangeKey, bounds: RangeBounds): Promise<AnalyticsSnapshot> {
  // The dates stored in analytics_daily are UTC dates from the aggregation
  // cron. There's a slight semantic gap — a "May 1" row in analytics_daily
  // contains data for May 1 UTC, which is roughly May 1 Eastern but not
  // exactly. For weekly/monthly views this is close enough; if you need
  // tighter Eastern-day precision later we'd need to re-key the daily
  // aggregates by Eastern date.
  const startDate = bounds.startIso.slice(0, 10);
  const endDateExclusive = bounds.endIso.slice(0, 10);

  const { data: rows, error } = await supabaseAdmin
    .from('analytics_daily')
    .select('date, path, pageviews, unique_visitors, total_sessions')
    .gte('date', startDate)
    .lt('date', endDateExclusive)
    .order('date', { ascending: true });

  if (error) {
    console.error('[analytics] aggregate fetch failed:', error);
    return emptySnapshot(range);
  }

  const all = rows || [];

  let totalPv = 0;
  let totalUv = 0;
  let totalSess = 0;
  const pathTotals = new Map<string, number>();
  const dailyTotals = new Map<string, number>();

  for (const r of all) {
    totalPv += r.pageviews;
    totalUv += r.unique_visitors;
    totalSess += r.total_sessions;
    pathTotals.set(r.path, (pathTotals.get(r.path) || 0) + r.pageviews);
    dailyTotals.set(r.date, (dailyTotals.get(r.date) || 0) + r.pageviews);
  }

  const timeline: TopRow[] = [];
  const startMs = new Date(bounds.startIso).getTime();
  const endMs = new Date(bounds.endIso).getTime();
  for (let d = startMs; d < endMs; d += 24 * 60 * 60 * 1000) {
    const dateStr = new Date(d).toISOString().slice(0, 10);
    const label = formatShortDate(dateStr);
    timeline.push({ label, count: dailyTotals.get(dateStr) || 0 });
  }

  return {
    range,
    stats: {
      pageviews: totalPv,
      unique_visitors: totalUv,
      total_sessions: totalSess,
    },
    topPaths: topN(pathTotals, 10),
    topReferrers: [],
    topCountries: [],
    deviceBreakdown: [],
    timeline,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function topN(counts: Map<string, number>, n: number): TopRow[] {
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

function formatShortDate(dateStr: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [, m, d] = dateStr.split('-');
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

function emptySnapshot(range: RangeKey): AnalyticsSnapshot {
  return {
    range,
    stats: { pageviews: 0, unique_visitors: 0, total_sessions: 0 },
    topPaths: [],
    topReferrers: [],
    topCountries: [],
    deviceBreakdown: [],
    timeline: [],
  };
}
