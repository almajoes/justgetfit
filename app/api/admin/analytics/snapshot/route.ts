import { NextRequest, NextResponse } from 'next/server';
import { getAnalyticsSnapshot, type RangeKey } from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/analytics/snapshot?range=now
 *
 * Returns a fresh analytics snapshot for the given range. Called by the
 * client component to refresh the dashboard.
 *
 * Auth: middleware-level basic auth on /admin and /api/admin/* paths is
 * already in place. No additional auth check needed here.
 */
export async function GET(req: NextRequest) {
  const range = (req.nextUrl.searchParams.get('range') || 'now') as RangeKey;
  const valid: RangeKey[] = ['now', 'today', 'yesterday', '7d', '30d'];
  if (!valid.includes(range)) {
    return NextResponse.json({ error: 'invalid range' }, { status: 400 });
  }

  const snapshot = await getAnalyticsSnapshot(range);
  return NextResponse.json(snapshot, {
    headers: {
      // Aggressive no-cache — analytics data is real-time, never cache it
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  });
}
