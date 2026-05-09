/**
 * Shared loader for fetching confirmed subscribers for the AudiencePicker.
 *
 * Used by 3 admin server pages: /admin/drafts/[id], /admin/posts/[id],
 * /admin/broadcast. Each duplicates the same paginated fetch otherwise;
 * this loader is the single source of truth.
 *
 * Throttle rule (May 2026 update — TWICE-WEEKLY CADENCE):
 *   - Throttle ONLY applies to subscribers with source = 'import'
 *   - Limit: max 2 newsletter sends per rolling 7 days
 *   - Form-subscribers and any custom-source-label subscribers are NEVER
 *     throttled
 *
 * To enforce the per-subscriber count we query email_events ONCE per
 * load — fetch every (email, occurred_at) tuple where event_type='sent'
 * in the past 7 days, group by email, and produce a count-per-email map.
 * Each returned subscriber row carries a `recent_send_count` value (0 for
 * never-mailed or non-imported subs that we don't bother counting).
 *
 * The picker + resolveAudience + API routes all consume this count to
 * decide eligibility — a subscriber is throttled iff
 *     source === 'import' AND recent_send_count >= 2
 *
 * `last_sent_at` is still returned because the admin Subscribers table
 * shows it as a column. It's no longer used for throttle decisions.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THROTTLE_LIMIT = 2; // max sends per rolling 7 days for source='import'
const THROTTLE_SOURCE = 'import'; // exact source value to throttle

export type SubscriberForPicker = {
  id: string;
  email: string;
  source: string | null;
  subscribed_at: string;
  last_sent_at: string | null;
  /**
   * Number of `sent` email_events for this subscriber in the past 7 rolling
   * days. Only meaningful when source === 'import' (the throttle target).
   * For any other source we leave it at 0 — saves us a wasted Set lookup
   * per non-imported row, and signals to consumers that throttle doesn't
   * apply.
   */
  recent_send_count: number;
};

/**
 * Throttle policy constants exported so the picker, resolveAudience, and
 * API routes all reference the same numbers and source label. If you ever
 * change the cap or the source label, change it here once.
 */
export const THROTTLE_POLICY = {
  /** Window the count is taken over, in milliseconds. */
  windowMs: SEVEN_DAYS_MS,
  /** Max sends allowed in the window before the subscriber is excluded. */
  limit: THROTTLE_LIMIT,
  /** Source label that triggers the throttle (others are exempt). */
  source: THROTTLE_SOURCE,
} as const;

/**
 * Returns true if a subscriber should be excluded from a newsletter send
 * by the throttle rule. Pure helper — same logic everywhere.
 */
export function isThrottled(subscriber: { source: string | null; recent_send_count: number }) {
  return subscriber.source === THROTTLE_SOURCE && subscriber.recent_send_count >= THROTTLE_LIMIT;
}

export async function loadConfirmedSubscribers(): Promise<SubscriberForPicker[]> {
  // ─── Step 1: build the recent-sends-per-email map for imported subs ──
  // We only need counts for source='import' subs, but the cleanest query
  // is to grab everyone with a `sent` event in the past 7 days and let the
  // post-load filter decide. The set is bounded — even at high volume,
  // 9k subs × 2 sends/week ≈ 18k events max, well within memory.
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  const sendCountByEmail = new Map<string, number>();

  // Paginate through email_events to avoid the implicit 1000-row cap.
  // Stable ordering: occurred_at desc + id asc (id tie-breaker) per the
  // pagination patterns codified earlier this year.
  const EVENTS_PAGE = 1000;
  let eventsFrom = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('email_events')
      .select('email')
      .eq('event_type', 'sent')
      .gte('occurred_at', sevenDaysAgo)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: true })
      .range(eventsFrom, eventsFrom + EVENTS_PAGE - 1);

    if (error) {
      console.error('[loadConfirmedSubscribers] events count query failed:', error.message);
      break;
    }
    const batch = (data as { email: string }[]) || [];
    for (const ev of batch) {
      const k = (ev.email || '').toLowerCase();
      if (!k) continue;
      sendCountByEmail.set(k, (sendCountByEmail.get(k) || 0) + 1);
    }
    if (batch.length < EVENTS_PAGE) break;
    eventsFrom += EVENTS_PAGE;
    if (eventsFrom > 500000) break; // safety bail
  }

  // ─── Step 2: paginate confirmed subscribers ──
  const PAGE = 1000;
  const all: SubscriberForPicker[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('subscribers')
      .select('id, email, source, subscribed_at, last_sent_at')
      .eq('status', 'confirmed')
      // Stable ordering: subscribed_at desc with id as tie-breaker (avoids
      // the pagination-skip bug from when sort key isn't unique).
      .order('subscribed_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error('[loadConfirmedSubscribers] paged query failed:', error.message);
      break;
    }

    const batch = (data as Omit<SubscriberForPicker, 'recent_send_count'>[]) || [];
    for (const row of batch) {
      // Only attach a real count for imported subs — everyone else gets 0
      // since the throttle rule doesn't apply to them anyway.
      const recent =
        row.source === THROTTLE_SOURCE
          ? sendCountByEmail.get((row.email || '').toLowerCase()) || 0
          : 0;
      all.push({ ...row, recent_send_count: recent });
    }

    if (batch.length < PAGE) break;
    from += PAGE;
    if (from > 200000) break; // safety bail
  }
  return all;
}
