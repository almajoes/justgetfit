/**
 * Server-side throttle helper for newsletter sends.
 *
 * Mirrors the throttle policy applied client-side by AudiencePicker /
 * resolveAudience (May 2026 update — twice-weekly cadence):
 *
 *   - Throttle ONLY applies to subscribers with source === 'import'
 *   - Excludes those with >= 2 sends in the past 7 rolling days
 *   - Form-subscribers and any custom-source-label subscribers are NEVER
 *     throttled (regardless of send history)
 *
 * Why server-side enforcement? The admin UI applies the same policy, but
 * the API routes /api/admin/drafts/[id], /api/admin/newsletter/send, and
 * /api/admin/audience-preview have to enforce it on their own — anyone
 * crafting a request directly (or an admin who took a long time to click
 * "send" while the underlying counts shifted) shouldn't be able to bypass
 * the rule.
 *
 * Implementation: a single email_events query gathers per-email send
 * counts in the past 7 days, then we filter the supplied subscriber list,
 * removing rows where source='import' AND count >= 2. Returns a
 * Set<string> of subscriber IDs to exclude.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THROTTLE_LIMIT = 2;
const THROTTLE_SOURCE = 'import';

/**
 * Build the exclusion ID set for a given list of subscribers. Pass in an
 * array of `{ id, email, source }` rows; get back a Set of IDs that should
 * be filtered out of the recipient list.
 *
 * Empty input → empty Set, no DB query.
 */
export async function buildThrottleExclusions(
  subscribers: { id: string; email: string; source: string | null }[]
): Promise<Set<string>> {
  const out = new Set<string>();
  if (subscribers.length === 0) return out;

  // Only imported subscribers can be throttled — anyone else is a free pass.
  // We also need their email addresses (lowercased) so we can join against
  // email_events.
  const importedByEmail = new Map<string, string[]>(); // email -> ids[]
  for (const s of subscribers) {
    if (s.source !== THROTTLE_SOURCE) continue;
    const k = (s.email || '').toLowerCase();
    if (!k) continue;
    const arr = importedByEmail.get(k);
    if (arr) arr.push(s.id);
    else importedByEmail.set(k, [s.id]);
  }
  if (importedByEmail.size === 0) return out;

  // Pull every `sent` event in the past 7 days and tally per-email. We
  // could `.in()` filter by the imported emails for a smaller scan but
  // that breaks past 200 emails (URL length limit) and doesn't actually
  // save much — even a busy week is bounded by 2 sends × N subs.
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  const sendCountByEmail = new Map<string, number>();

  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('email_events')
      .select('email')
      .eq('event_type', 'sent')
      .gte('occurred_at', sevenDaysAgo)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error('[throttle] events query failed:', error.message);
      // Fail open: if we can't read events, don't accidentally throttle
      // everyone. The picker UI also enforces the limit, so the client
      // path stays correct; this just protects against the API path
      // double-throttling on a transient DB failure.
      return out;
    }
    const batch = (data as { email: string }[]) || [];
    for (const ev of batch) {
      const k = (ev.email || '').toLowerCase();
      if (!k) continue;
      sendCountByEmail.set(k, (sendCountByEmail.get(k) || 0) + 1);
    }
    if (batch.length < PAGE) break;
    from += PAGE;
    if (from > 500000) break; // safety bail
  }

  // For each imported sub, decide if they're over the cap.
  for (const [email, ids] of importedByEmail.entries()) {
    const count = sendCountByEmail.get(email) || 0;
    if (count >= THROTTLE_LIMIT) {
      for (const id of ids) out.add(id);
    }
  }

  return out;
}
