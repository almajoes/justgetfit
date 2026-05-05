/**
 * Filter "bot" click and open events from email_events stats.
 *
 * Why this exists:
 * Corporate email security gateways (Mimecast, Proofpoint, Microsoft Defender
 * for Office 365, Barracuda, etc.) and mail-client privacy features (Apple
 * Mail Privacy Protection) auto-fetch every link and image in incoming email
 * as a security/privacy measure. Resend's tracking system records each
 * pre-fetch as a click or open event because at the HTTP level it's
 * indistinguishable from a real one. Result: a single corporate recipient
 * generates click events on every link in the email at the same second.
 *
 * Heuristic: BURST DETECTION
 *   For each recipient, look at all their events of a given type (clicked or
 *   opened). Sort by occurred_at. If ANY pair of consecutive events for the
 *   same type from the same recipient is within 5 seconds, treat ALL events
 *   of that type from that recipient as a bot burst and exclude them.
 *
 * Rationale:
 *   - Real humans click ONE link in an email and move on, or click 2-3 links
 *     spread out over minutes/hours of reading.
 *   - Scanners click EVERY link in milliseconds to seconds.
 *   - A recipient with a single isolated click → real human, KEEP.
 *   - A recipient with 5 clicks at 14:25:25.844 → scanner, EXCLUDE all 5.
 *   - A recipient with 2 clicks 90 seconds apart → real human, KEEP both.
 *   - A recipient with 2 clicks 3 seconds apart → likely scanner, EXCLUDE.
 *
 * The filter is intentionally per-recipient per-event-type: a recipient
 * could have legit clicks AND have their email scanned (their scanner
 * pre-fetched, then they later opened and clicked for real). In that case
 * the early burst gets all flagged. False negative is preferable to false
 * positive — we'd rather miss some real clicks than count scanner noise as
 * engagement.
 */

const BURST_WINDOW_MS = 5 * 1000;

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
  // Group events by (email, event_type), but only for opens and clicks.
  // Sent/delivered/bounced/complained are server-side events from Resend's
  // SMTP layer and aren't subject to this kind of inflation.
  const grouped = new Map<string, FilterableEvent[]>();
  for (const ev of events) {
    if (ev.event_type !== 'opened' && ev.event_type !== 'clicked') continue;
    const k = `${ev.email}|${ev.event_type}`;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(ev);
  }

  const excluded = new Set<string>();
  for (const [, evs] of grouped) {
    if (evs.length < 2) continue; // single events can't be a burst
    // Sort by occurred_at ascending
    const sorted = evs
      .map((e) => ({ ev: e, t: new Date(e.occurred_at).getTime() }))
      .sort((a, b) => a.t - b.t);
    // Detect burst: any consecutive pair within BURST_WINDOW_MS
    let isBurst = false;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].t - sorted[i - 1].t <= BURST_WINDOW_MS) {
        isBurst = true;
        break;
      }
    }
    if (isBurst) {
      for (const { ev } of sorted) excluded.add(eventKey(ev));
    }
  }
  return excluded;
}

export function eventKey(ev: { email: string; event_type: string; occurred_at: string }): string {
  return `${ev.email}|${ev.event_type}|${ev.occurred_at}`;
}
