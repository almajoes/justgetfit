import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/purge-pageviews
 *
 * Runs daily after the aggregation job. Deletes raw pageview rows older
 * than the retention window (90 days). Aggregated stats in analytics_daily
 * persist forever — we only purge the row-level event log.
 *
 * Why 90 days: keeps the table size bounded (back-of-envelope: 50k pageviews/day
 * × 90 days = 4.5M rows; manageable but not unbounded). Long enough to
 * investigate any anomalies (e.g. "spike on April 13?") for a few months
 * with the full row detail. After that, the daily aggregates are sufficient
 * for trend analysis.
 *
 * To change the window: edit RETENTION_DAYS below. To purge nothing (keep
 * everything forever), set to 0 or comment out the cron in vercel.json.
 */

const RETENTION_DAYS = 90;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  if (RETENTION_DAYS <= 0) {
    return NextResponse.json({ ok: true, skipped: 'retention disabled' });
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  const cutoffIso = cutoff.toISOString();

  const { error, count } = await supabaseAdmin
    .from('pageviews')
    .delete({ count: 'exact' })
    .lt('created_at', cutoffIso);

  if (error) {
    console.error('[purge-pageviews] delete failed:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    cutoff: cutoffIso,
    deleted: count ?? 0,
  });
}
