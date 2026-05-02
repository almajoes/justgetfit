import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/aggregate-analytics
 *
 * Vercel cron runs this once per day at 00:15 UTC. Rolls yesterday's raw
 * pageview rows into the analytics_daily table — one row per (date, path)
 * with pageviews, unique visitors, and session count.
 *
 * Why aggregate: the dashboard's "last 30 days" tile would need to scan ~30
 * days of raw pageviews otherwise. At any meaningful traffic volume this
 * gets slow. analytics_daily keeps historical queries instant — it's tiny
 * (a few MB even after years of data) and indexed on date.
 *
 * The job is idempotent: running it twice for the same date would produce
 * the same result because we delete-then-insert (or upsert) rows for that
 * date. Safe if the cron retries.
 *
 * Auth: same pattern as other cron routes — Bearer CRON_SECRET header.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Aggregate yesterday's data (UTC). The cron runs at 00:15 UTC so this
  // gives us a full clean day to roll up.
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10); // YYYY-MM-DD

  const dayStart = `${dateStr}T00:00:00Z`;
  const dayEnd = `${dateStr}T23:59:59.999Z`;

  // Pull all human (non-bot) pageviews for the day. We accept that this
  // could be large (tens of thousands of rows) — Supabase handles that fine
  // and we only run it once a day. Filtering bots out at query time so the
  // aggregate reflects "real" traffic.
  const { data: rows, error: fetchErr } = await supabaseAdmin
    .from('pageviews')
    .select('path, visitor_hash, session_id')
    .eq('is_bot', false)
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd);

  if (fetchErr) {
    console.error('[aggregate-analytics] fetch failed:', fetchErr);
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  }

  // Group by path
  type PathStats = {
    pageviews: number;
    visitors: Set<string>;
    sessions: Set<string>;
  };
  const byPath = new Map<string, PathStats>();
  for (const row of rows || []) {
    let stats = byPath.get(row.path);
    if (!stats) {
      stats = { pageviews: 0, visitors: new Set(), sessions: new Set() };
      byPath.set(row.path, stats);
    }
    stats.pageviews += 1;
    stats.visitors.add(row.visitor_hash);
    if (row.session_id) stats.sessions.add(row.session_id);
  }

  // Build upsert payload
  const upsertRows = Array.from(byPath.entries()).map(([path, stats]) => ({
    date: dateStr,
    path,
    pageviews: stats.pageviews,
    unique_visitors: stats.visitors.size,
    total_sessions: stats.sessions.size,
  }));

  // Delete-then-insert pattern is safer than upsert here because some old
  // paths might no longer have any traffic for a re-run; upsert wouldn't
  // remove their stale rows. Delete + insert always reflects reality.
  const { error: delErr } = await supabaseAdmin
    .from('analytics_daily')
    .delete()
    .eq('date', dateStr);
  if (delErr) {
    console.error('[aggregate-analytics] delete failed:', delErr);
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  }

  if (upsertRows.length > 0) {
    // Insert in batches of 500 just in case a wildly busy day produces
    // thousands of distinct paths
    for (let i = 0; i < upsertRows.length; i += 500) {
      const batch = upsertRows.slice(i, i + 500);
      const { error: insertErr } = await supabaseAdmin
        .from('analytics_daily')
        .insert(batch);
      if (insertErr) {
        console.error('[aggregate-analytics] insert batch failed:', insertErr);
        return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    date: dateStr,
    rowsScanned: rows?.length || 0,
    pathsAggregated: upsertRows.length,
  });
}
