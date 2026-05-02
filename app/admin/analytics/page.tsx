import { getAnalyticsSnapshot } from '@/lib/analytics';
import { AnalyticsClient } from '@/components/admin/AnalyticsClient';

// Triple cache-busting — analytics is the most real-time-sensitive data on
// the site. Any caching here is wrong. See CRITICAL PATTERNS in HANDOFF.md.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Analytics · Admin',
  robots: { index: false, follow: false },
};

/**
 * /admin/analytics
 *
 * Pre-fetches both a "now" (real-time tile) and a default "today" snapshot
 * server-side so the page renders complete on first paint. The client then
 * polls the snapshot endpoint every 15s for the real-time tile only.
 *
 * When the user switches range pills, the client re-fetches all data for
 * the new range from the snapshot endpoint.
 */
export default async function AdminAnalyticsPage() {
  const [nowSnapshot, todaySnapshot] = await Promise.all([
    getAnalyticsSnapshot('now'),
    getAnalyticsSnapshot('today'),
  ]);

  return <AnalyticsClient initialNow={nowSnapshot} initialRange={todaySnapshot} />;
}
