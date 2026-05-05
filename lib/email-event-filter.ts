/**
 * Filter "bot" click and open events from email_events stats.
 *
 * Why this exists:
 * Corporate email security gateways (Mimecast, Proofpoint, Microsoft Defender
 * for Office 365, Barracuda, etc.) and mail-client privacy features
 * (Apple Mail Privacy Protection) pre-fetch every link and image in incoming
 * email as a security/privacy measure. Resend's tracking system records each
 * pre-fetch as a click or open event because it's indistinguishable from a
 * real one at the HTTP level. Result: a single corporate recipient generates
 * multiple "click" events on every link in the email at the exact same
 * millisecond, and an iPhone APMP user generates an "open" event the moment
 * the message lands in the inbox.
 *
 * Heuristic (industry-standard for marketing tools that bother to filter):
 *   An event is "likely bot" if:
 *     - user_agent is null/empty AND
 *     - it occurred within 30 seconds of the recipient's `delivered` event
 *
 * Real humans receive an email, the inbox notification fires, they have to
 * actually open the message and read it before clicking — that's never under
 * 30 seconds. Server-side pre-fetchers fire within milliseconds of delivery.
 *
 * This filter is conservative — it only excludes events that have BOTH the
 * NULL user-agent signature AND the sub-30s timing. A real click that
 * happens to be missing user-agent (rare) but later than 30s is preserved.
 * A real click within 30s but with a real user-agent (also rare but possible)
 * is preserved.
 */

const BOT_WINDOW_MS = 30 * 1000;

type FilterableEvent = {
  email: string;
  event_type: string;
  user_agent: string | null;
  occurred_at: string;
};

/**
 * Returns the set of (email, event_type) pairs that should be EXCLUDED from
 * stats. Compute once per send, then check `excluded.has(makeKey(event))` to
 * filter individual events.
 *
 * Per-recipient logic: for each subscriber, find the earliest `delivered`
 * timestamp; mark any opened/clicked events from that subscriber that fired
 * within 30s AND with a NULL user agent as bot events.
 */
export function computeBotExclusions(events: FilterableEvent[]): Set<string> {
  // Earliest delivered timestamp per recipient
  const deliveredAt = new Map<string, number>();
  for (const ev of events) {
    if (ev.event_type !== 'delivered') continue;
    const t = new Date(ev.occurred_at).getTime();
    const existing = deliveredAt.get(ev.email);
    if (existing === undefined || t < existing) {
      deliveredAt.set(ev.email, t);
    }
  }

  const excluded = new Set<string>();
  for (const ev of events) {
    if (ev.event_type !== 'opened' && ev.event_type !== 'clicked') continue;
    if (ev.user_agent && ev.user_agent.trim() !== '') continue; // real user-agent → keep
    const delivered = deliveredAt.get(ev.email);
    if (delivered === undefined) continue; // no delivered event → can't compare → keep
    const eventTime = new Date(ev.occurred_at).getTime();
    if (eventTime - delivered < BOT_WINDOW_MS) {
      // Mark this specific event as bot. Use a per-event key (email + type +
      // timestamp) so we can filter individual rows, not all of a recipient's
      // events.
      excluded.add(eventKey(ev));
    }
  }
  return excluded;
}

export function eventKey(ev: { email: string; event_type: string; occurred_at: string }): string {
  return `${ev.email}|${ev.event_type}|${ev.occurred_at}`;
}

/**
 * Filter an array of events, removing bot pre-fetches. Returns a new array.
 * Pure function — does not modify the input.
 */
export function filterBotEvents<T extends FilterableEvent>(events: T[]): T[] {
  const excluded = computeBotExclusions(events);
  return events.filter((ev) => !excluded.has(eventKey(ev)));
}
