import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Admin counter system
 *
 * Each section in the admin can show a badge in the sidebar / mobile More sheet
 * indicating "new" items needing attention. Two patterns:
 *
 *   "Current state" counters — always reflect reality (no last-viewed tracking):
 *     - drafts: count where status='pending' (drafts not yet published)
 *     - inbox:  count where read_at IS NULL AND deleted_at IS NULL (unread)
 *
 *   "Since last visit" counters — uses admin_view_state.last_viewed_at:
 *     - topics: count where created_at > last_viewed_at['topics']
 *     - subscribers: count where confirmed_at > last_viewed_at['subscribers']
 *
 * On page visit, the admin layout / page calls markViewed(section) which
 * updates last_viewed_at = now(), clearing the badge for that section.
 *
 * Cache-busting note: callers MUST set `dynamic = 'force-dynamic'` and
 * `revalidate = 0` on any page that displays these counts. We learned this
 * pattern the hard way during the inbox feature build — Next.js will happily
 * serve stale HTML containing old counts otherwise. The admin layout is the
 * only place these counts are rendered, and it should always render fresh.
 */

export type AdminCounts = {
  drafts: number;       // Drafts pending publish
  topics: number;       // Topics created since last visit to /admin/topics
  subscribers: number;  // Subscribers confirmed since last visit to /admin/subscribers
  inbox: number;        // Unread inbox messages
};

/**
 * Fetch all four counter values in parallel. Returns zeros on any error so
 * the layout never breaks because of a counter — counters are decorative.
 */
export async function getAdminCounts(): Promise<AdminCounts> {
  try {
    // Last-viewed timestamps for the two "since last visit" counters.
    // We fetch all section rows in one query and pick out what we need.
    const { data: viewStateRows } = await supabaseAdmin
      .from('admin_view_state')
      .select('section, last_viewed_at');

    const viewState: Record<string, string> = {};
    for (const row of viewStateRows || []) {
      viewState[row.section] = row.last_viewed_at;
    }

    // Default last-viewed to now if missing — first deploy without seed data,
    // we still don't want to show every row as "new"
    const topicsSince = viewState.topics || new Date().toISOString();
    const subscribersSince = viewState.subscribers || new Date().toISOString();

    // Run all four counts in parallel using HEAD count queries (no row data
    // shipped, just the count).
    const [draftsRes, topicsRes, subscribersRes, inboxRes] = await Promise.all([
      supabaseAdmin
        .from('drafts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabaseAdmin
        .from('topics')
        .select('id', { count: 'exact', head: true })
        .gt('created_at', topicsSince),
      supabaseAdmin
        .from('subscribers')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'confirmed')
        .gt('confirmed_at', subscribersSince),
      supabaseAdmin
        .from('contact_messages')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
        .is('deleted_at', null),
    ]);

    return {
      drafts: draftsRes.count ?? 0,
      topics: topicsRes.count ?? 0,
      subscribers: subscribersRes.count ?? 0,
      inbox: inboxRes.count ?? 0,
    };
  } catch (err) {
    console.error('[admin-counts] failed:', err);
    return { drafts: 0, topics: 0, subscribers: 0, inbox: 0 };
  }
}

/**
 * Mark a section as viewed. Called from the page that owns the section
 * (e.g. /admin/topics calls markViewed('topics')) so the counter resets when
 * the admin actually looks at the data.
 *
 * Uses upsert in case the seed row was missed — idempotent across re-deploys.
 *
 * Best-effort: errors are logged but never thrown. A failed mark-viewed just
 * means the badge stays elevated until next visit; not worth crashing for.
 */
export async function markViewed(section: 'drafts' | 'topics' | 'subscribers' | 'inbox'): Promise<void> {
  try {
    await supabaseAdmin
      .from('admin_view_state')
      .upsert(
        { section, last_viewed_at: new Date().toISOString() },
        { onConflict: 'section' }
      );
  } catch (err) {
    console.error(`[admin-counts] markViewed(${section}) failed:`, err);
  }
}
