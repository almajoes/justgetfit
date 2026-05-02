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
 */

export type RangeKey = 'now' | 'today' | 'yesterday' | '7d' | '30d';

export type RangeBounds = {
  startIso: string;
  endIso: string;
  /** 'raw' = query pageviews; 'aggregate' = query analytics_daily */
  source: 'raw' | 'aggregate';
};

/**
 * Compute the time bounds for a given range. UTC throughout — keeps things
 * predictable across servers and matches what the cron uses.
 *
 * "now" = last 5 minutes (real-time tile)
 * "today" = midnight UTC today through now
 * "yesterday" = full UTC yesterday
 * "7d" = last 7 full days (yesterday back, doesn't include today since we
 *        haven't aggregated today yet)
 * "30d" = last 30 full days (same reasoning)
 */
export function getRangeBounds(range: RangeKey): RangeBounds {
  const now = new Date();
  if (range === 'now') {
    const start = new Date(now.getTime() - 5 * 60 * 1000);
    return { startIso: start.toISOString(), endIso: now.toISOString(), source: 'raw' };
  }
  if (range === 'today') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { startIso: start.toISOString(), endIso: now.toISOString(), source: 'raw' };
  }
  if (range === 'yesterday') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { startIso: start.toISOString(), endIso: end.toISOString(), source: 'raw' };
  }
  if (range === '7d') {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { startIso: start.toISOString(), endIso: end.toISOString(), source: 'aggregate' };
  }
  // 30d
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
   * Each entry has a label (e.g. "14:00" or "Apr 25") and a pageview count. */
  timeline: TopRow[];
};

/**
 * Get a complete snapshot of analytics for the given range.
 * Used by both the server-rendered dashboard page and the polling endpoint.
 */
export async function getAnalyticsSnapshot(range: RangeKey): Promise<AnalyticsSnapshot> {
  const bounds = getRangeBounds(range);

  if (bounds.source === 'raw') {
    return getRawSnapshot(range, bounds);
  }
  return getAggregateSnapshot(range, bounds);
}

// ─── Raw pageviews snapshot (now/today/yesterday) ─────────────────────────
async function getRawSnapshot(range: RangeKey, bounds: RangeBounds): Promise<AnalyticsSnapshot> {
  // Pull all matching rows once, then compute everything in JS.
  // For the time windows we're talking about (max 24h on a busy site, ~50k
  // rows worst case) this is fine — Postgres returns it in one query and we
  // compute multiple metrics from a single fetch.
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

  // Stats
  const visitors = new Set<string>();
  const sessions = new Set<string>();
  for (const r of all) {
    visitors.add(r.visitor_hash);
    if (r.session_id) sessions.add(r.session_id);
  }

  // Top paths
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

  // Timeline — hourly buckets for "today"/"yesterday", 5-min buckets for "now"
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

function buildRawTimeline(
  range: RangeKey,
  rows: Array<{ created_at: string }>,
  bounds: RangeBounds
): TopRow[] {
  if (range === 'now') {
    // 5 buckets of 1 minute each
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

  // Hourly buckets for today/yesterday
  const buckets = new Array(24).fill(0).map((_, h) => ({
    label: String(h).padStart(2, '0') + ':00',
    count: 0,
  }));
  for (const r of rows) {
    const h = new Date(r.created_at).getUTCHours();
    if (h >= 0 && h < 24) buckets[h].count++;
  }
  // For "today", trim trailing empty hours past current hour
  if (range === 'today') {
    const currentHour = new Date().getUTCHours();
    return buckets.slice(0, currentHour + 1);
  }
  return buckets;
}

// ─── Aggregate snapshot (7d/30d) ──────────────────────────────────────────
async function getAggregateSnapshot(range: RangeKey, bounds: RangeBounds): Promise<AnalyticsSnapshot> {
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

  // Stats — sum across all rows in range. Note: unique_visitors is SUMMED
  // not deduplicated cross-day. That's intentional and matches how most
  // analytics tools display weekly/monthly counts. To get true cross-day
  // dedup we'd need to query raw pageviews which is exactly what we're
  // avoiding for performance reasons. Daily aggregates are unique-per-day.
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

  // Build timeline with one entry per day in the range, even if a day had
  // zero pageviews — the chart looks weird with gaps otherwise.
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
    // Aggregate ranges don't have these breakdowns — UI renders them empty
    // and shows a hint "switch to Today for full breakdowns" message.
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
  // Convert YYYY-MM-DD to "Apr 25"
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
