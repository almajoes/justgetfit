/**
 * Filter "bot" click and open events from email_events stats.
 *
 * Why this exists:
 * Corporate email security gateways (Mimecast, Proofpoint, Microsoft Defender
 * for Office 365, Barracuda, etc.) and mail-client privacy features (Apple
 * Mail Privacy Protection) auto-fetch every link and image in incoming email
 * as a security/privacy measure. They issue all the fetches in PARALLEL, so
 * the resulting HTTP requests hit Resend's tracking endpoint within the same
 * millisecond and end up with IDENTICAL timestamps in the email_events table.
 * Resend logs each as a click/open event because at the HTTP level it's
 * indistinguishable from a real one.
 *
 * Heuristic: SAME-TIMESTAMP DETECTION
 *   For each (recipient, event_type) group, if 2+ events share the EXACT
 *   same occurred_at timestamp, all events in that group at that timestamp
 *   are treated as a scanner burst and excluded.
 *
 * Rationale:
 *   - Real humans physically cannot click two links at the exact same
 *     millisecond. Even fast clicking has tens of milliseconds between
 *     events; a real "double click" registers as a single click in browsers.
 *   - Scanners issue parallel HTTP fetches; their timestamps are identical
 *     down to the millisecond.
 *   - If a recipient has multiple clicks at DIFFERENT millisecond timestamps,
 *     they're real human clicks (or a scanner that arrived at Resend with
 *     enough network jitter to land in different ms — vanishingly rare).
 *
 * Examples against actual data we've seen:
 *   - bryan@dwpm.com: 5 clicks all at 22:25:25.844 → 5 events sharing one
 *     timestamp → all 5 excluded.
 *   - penpro23@gmail.com: 1 click at 09:31:48 → only 1 event at that
 *     timestamp → kept (real human).
 *   - A real user who clicks two links 3 seconds apart: timestamps differ
 *     (e.g. 09:31:48.123 and 09:31:51.456) → both kept.
 *
 * Per-recipient per-event-type-and-timestamp granularity: a recipient could
 * have a scanner burst at one moment AND a separate real click later at a
 * different timestamp. The burst gets excluded, the real click is kept.
 */

type FilterableEvent = {
  email: string;
  event_type: string;
  occurred_at: string;
};

/**
 * Returns the set of event keys (email|type|occurred_at) that should be
 * EXCLUDED from stats. Compute once per send/scope, then check
 * `excluded.has(eventKey(event))` to filter individual events.
 */
export function computeBotExclusions(events: FilterableEvent[]): Set<string> {
  // Group by (email, event_type, occurred_at) — only opens and clicks are
  // subject to bot inflation. Sent/delivered/bounced/complained come from
  // Resend's SMTP layer, not the tracking endpoint.
  const counts = new Map<string, number>();
  for (const ev of events) {
    if (ev.event_type !== 'opened' && ev.event_type !== 'clicked') continue;
    const k = eventKey(ev);
    counts.set(k, (counts.get(k) || 0) + 1);
  }

  const excluded = new Set<string>();
  for (const [k, count] of counts) {
    if (count >= 2) excluded.add(k);
  }
  return excluded;
}

export function eventKey(ev: { email: string; event_type: string; occurred_at: string }): string {
  return `${ev.email}|${ev.event_type}|${ev.occurred_at}`;
}
