/**
 * Shared loader for fetching confirmed subscribers for the AudiencePicker.
 *
 * Used by 3 admin server pages: /admin/drafts/[id], /admin/posts/[id],
 * /admin/broadcast. Previously each duplicated the same paginated fetch;
 * now they share this loader.
 *
 * IMPORTANT: returns `last_sent_at` so the picker can identify subscribers
 * who would be throttled by the 7-day cooldown for newsletter sends. The
 * picker decides whether to apply the throttle filter based on context
 * (newsletters: yes; broadcasts: no, by user policy).
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

export type SubscriberForPicker = {
  id: string;
  email: string;
  source: string | null;
  subscribed_at: string;
  last_sent_at: string | null;
};

export async function loadConfirmedSubscribers(): Promise<SubscriberForPicker[]> {
  const PAGE = 1000;
  const all: SubscriberForPicker[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('subscribers')
      .select('id, email, source, subscribed_at, last_sent_at')
      .eq('status', 'confirmed')
      // Stable ordering: subscribed_at desc with id as tie-breaker (avoids the
      // pagination-skip bug from when sort key isn't unique).
      .order('subscribed_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error('[loadConfirmedSubscribers] paged query failed:', error.message);
      break;
    }

    const batch = (data as SubscriberForPicker[]) || [];
    for (const row of batch) all.push(row);

    if (batch.length < PAGE) break;
    from += PAGE;
    if (from > 200000) break; // safety bail
  }
  return all;
}
