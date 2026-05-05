import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ResendPanel } from '@/components/admin/ResendPanel';
import { SendEventsTable } from '@/components/admin/SendEventsTable';
import { RefreshSendStatsButton } from '@/components/admin/RefreshSendStatsButton';
import { formatEastern } from '@/lib/format-date';
import { loadConfirmedSubscribers } from '@/lib/subscribers';
import { computeBotExclusions, eventKey } from '@/lib/email-event-filter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata = { title: 'Send detail · Admin' };

type SendRow = {
  id: string;
  kind: 'post' | 'broadcast';
  subject: string | null;
  sent_at: string;
  recipient_count: number;
  failed_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  complained_count: number;
  status: string;
  notes: string | null;
  post_id: string | null;
  posts?: { title: string; slug: string; category: string | null } | null;
};

type EventRow = {
  id: string;
  event_type: string;
  email: string;
  link_url: string | null;
  user_agent: string | null;
  occurred_at: string;
};

type SubRow = import('@/lib/subscribers').SubscriberForPicker;

function pct(n: number, d: number): string {
  if (!d) return '—';
  return `${((n / d) * 100).toFixed(1)}%`;
}

// Subscribers for the ResendPanel come from the centralized
// loadConfirmedSubscribers() helper in lib/subscribers, which returns the
// last_sent_at field that the picker's 7-day throttle filter requires.
// Without that field, the throttle filter silently no-ops and the picker
// shows the full unfiltered audience.

export default async function SendDetailPage({ params }: { params: { id: string } }) {
  // Fetch the send + post info in one query (also pull post_id explicitly so
  // the ResendPanel can target the post even if `posts(...)` join returns null
  // due to deletion).
  const { data: send } = await supabaseAdmin
    .from('newsletter_sends')
    .select('*, posts(title, slug, category)')
    .eq('id', params.id)
    .maybeSingle();
  if (!send) notFound();

  const sendRow = send as SendRow;

  // Only fetch subscriber list when the ResendPanel will actually render —
  // skip the (potentially expensive) paginated fetch for broadcast-kind sends.
  const subscribers: SubRow[] =
    sendRow.kind === 'post' && sendRow.post_id ? await loadConfirmedSubscribers() : [];

  // Fetch all events for this send. Must paginate — Supabase silently caps
  // single queries at 1,000 rows by default, and a single 1k-subscriber send
  // generates ~2-3k events (1k sent + delivered + bounced + opens + clicks).
  // Without pagination, the detail page would silently truncate and show
  // ~46% of the real numbers (verified May 4 2026 — earlier same bug
  // affected the send-log table query, fixed there earlier in the day, but
  // we missed this query in the detail page).
  const EVENT_PAGE = 1000;
  const events: EventRow[] = [];
  {
    let from = 0;
    while (true) {
      const { data: page, error } = await supabaseAdmin
        .from('email_events')
        .select('id, event_type, email, link_url, user_agent, occurred_at')
        .eq('send_id', params.id)
        // Stable ordering with id tie-breaker. occurred_at alone is not unique
        // — multiple events fire at the same millisecond during a send, and
        // pagination over a non-unique sort key skips/duplicates rows across
        // page boundaries (same bug we hit on subscriber pagination earlier).
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + EVENT_PAGE - 1);
      if (error) {
        console.error('[send detail] event pagination failed:', error.message);
        break;
      }
      const batch = (page as EventRow[]) || [];
      for (const ev of batch) events.push(ev);
      if (batch.length < EVENT_PAGE) break;
      from += EVENT_PAGE;
      if (from > 100000) break; // safety bail
    }
  }

  // Group by event type for the breakdown
  const byType: Record<string, EventRow[]> = {};
  for (const ev of events) {
    if (!byType[ev.event_type]) byType[ev.event_type] = [];
    byType[ev.event_type].push(ev);
  }

  // ─── Bot-event filter (same-timestamp detection) ─────────────────────────
  // Corporate email security scanners (Defender, Mimecast, Proofpoint, etc.)
  // and Apple Mail Privacy Protection pre-fetch every link in incoming
  // email by issuing parallel HTTP requests, which arrive at Resend's
  // tracking endpoint in the same millisecond and end up with IDENTICAL
  // occurred_at timestamps in the email_events table. The filter detects
  // this: when the (email, type, timestamp) tuple appears 2+ times, those
  // events are a parallel-fetch burst and are excluded. Real humans
  // physically cannot click two links at the exact same millisecond, so
  // single events at any given timestamp are kept.
  // See lib/email-event-filter.ts for full heuristic.
  const botExclusions = computeBotExclusions(events);
  const filteredOpened = (byType.opened || []).filter((ev) => !botExclusions.has(eventKey(ev)));
  const filteredClicked = (byType.clicked || []).filter((ev) => !botExclusions.has(eventKey(ev)));

  // Stash filtered counts for transparency banner below
  const botFilteredOpenCount = (byType.opened || []).length - filteredOpened.length;
  const botFilteredClickCount = (byType.clicked || []).length - filteredClicked.length;

  // For clicks: count unique clicks per URL — using FILTERED clicks only.
  const clicksByUrl = new Map<string, { count: number; uniqueUsers: Set<string> }>();
  for (const ev of filteredClicked) {
    const url = ev.link_url || '(unknown URL)';
    if (!clicksByUrl.has(url)) clicksByUrl.set(url, { count: 0, uniqueUsers: new Set() });
    const entry = clicksByUrl.get(url)!;
    entry.count += 1;
    entry.uniqueUsers.add(ev.email);
  }
  const clicksRanked = Array.from(clicksByUrl.entries())
    .map(([url, { count, uniqueUsers }]) => ({ url, totalClicks: count, uniqueClickers: uniqueUsers.size }))
    .sort((a, b) => b.uniqueClickers - a.uniqueClickers);

  // ─── Compute live stats from email_events (Resend = source of truth) ────
  // We trust the events table over cached counters on newsletter_sends because
  // the cached counters can become stale or wrong if the worker chain breaks
  // mid-send (May 4 2026 incident: worker reported processed_count=400 but
  // Resend only ever received 185 events). Counting events directly always
  // matches what Resend actually did.
  //
  // `intended` is the original audience size at send time — preserved on
  // newsletter_sends.recipient_count and never overwritten. The gap between
  // intended and sent shows worker-chain failures honestly.
  const eventCount = (type: string) =>
    (byType[type] || []).filter((e) => e !== undefined).length;

  const intended = sendRow.recipient_count;
  const sentCount = eventCount('sent');                  // What Resend received
  const deliveredCount = eventCount('delivered');        // Landed in inbox
  const bouncedCount = eventCount('bounced');            // Hard bounce
  const complainedCount = eventCount('complained');      // Marked as spam
  // Open/click counts use BOT-FILTERED events (excludes corporate-scanner
  // and APMP pre-fetches that fire within 30s of delivery with no user agent).
  const openedCount = new Set(filteredOpened.map((e) => e.email)).size;
  const clickedCount = new Set(filteredClicked.map((e) => e.email)).size;

  // "Not received" = subscribers we tried to send to but who never got the email.
  // = (intended - actually-sent) + bounced. Includes both subscribers where the
  // worker never made the Resend API call AND addresses Resend rejected.
  const notReceived = Math.max(0, intended - sentCount) + bouncedCount;

  // Backwards-compat: keep `delivered` for any existing references downstream,
  // but it now means "actually delivered to inbox" (event-derived).
  const delivered = deliveredCount;

  const titleLabel =
    sendRow.kind === 'broadcast'
      ? sendRow.subject || '(no subject)'
      : sendRow.posts?.title || '(deleted post)';

  // ResendPanel only available for kind='post' rows where the post still exists
  // (post_id non-null AND posts join returned data).
  const canResend = sendRow.kind === 'post' && sendRow.post_id && sendRow.posts;

  return (
    <div className="admin-page-pad" style={{ padding: 32, maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/admin/newsletter" style={{ color: 'var(--text-2)', fontSize: 13, textDecoration: 'none' }}>
          ← Back to send log
        </Link>
      </div>

      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span
          style={{
            background: sendRow.kind === 'broadcast' ? 'rgba(0,229,255,0.15)' : 'rgba(196,255,61,0.15)',
            color: sendRow.kind === 'broadcast' ? 'var(--neon-2, #00e5ff)' : 'var(--neon)',
            padding: '3px 10px',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 100,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {sendRow.kind}
        </span>
        <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{formatEastern(sendRow.sent_at)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', margin: 0, flex: 1 }}>
          {titleLabel}
        </h1>
        <RefreshSendStatsButton />
      </div>

      {/* Stat cards — all values computed live from email_events (Resend events).
          The cached fields on newsletter_sends are no longer trusted for display
          because they can desync if the worker chain breaks mid-send. */}
      <div
        className="admin-stat-row"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 32,
        }}
      >
        <Stat label="Intended" value={intended.toLocaleString()} />
        <Stat
          label="Actual"
          value={sentCount.toLocaleString()}
          accent={sentCount < intended ? '#ff9b6b' : undefined}
        />
        <Stat
          label="Delivered"
          value={`${deliveredCount.toLocaleString()} · ${pct(deliveredCount, sentCount)}`}
          accent={deliveredCount > 0 ? 'var(--neon)' : undefined}
        />
        <Stat
          label="Bounced"
          value={`${bouncedCount.toLocaleString()} · ${pct(bouncedCount, sentCount)}`}
          accent={bouncedCount > 0 ? '#ff9b6b' : undefined}
        />
        <Stat
          label="Complaints"
          value={`${complainedCount.toLocaleString()} · ${pct(complainedCount, deliveredCount)}`}
          accent={complainedCount > 0 ? '#ff6b6b' : undefined}
        />
        <Stat
          label="Unique openers"
          value={`${openedCount.toLocaleString()} · ${pct(openedCount, deliveredCount)}`}
          accent="var(--neon)"
        />
        <Stat
          label="Unique clickers"
          value={`${clickedCount.toLocaleString()} · ${pct(clickedCount, deliveredCount)}`}
          accent="var(--neon)"
        />
      </div>

      {/* Diagnostic warning if there's a gap between intended and sent */}
      {intended > sentCount && (
        <div
          style={{
            marginBottom: 24,
            padding: 14,
            background: 'rgba(255,107,107,0.08)',
            border: '1px solid rgba(255,107,107,0.3)',
            borderRadius: 12,
            color: '#ff9b6b',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong>Send gap:</strong> {intended.toLocaleString()} subscribers were intended for
          this send, but Resend only accepted {sentCount.toLocaleString()} (
          {(intended - sentCount).toLocaleString()} never sent). The watchdog cron should
          auto-recover stuck jobs going forward.
        </div>
      )}

      {/* Standalone Complaints display removed — Complaints is now in the
          main stat grid above. */}

      {/* Bot-filter transparency note. Only shown when filter actually kicked
          in. Tells the user that some opens/clicks were excluded from the
          stats above as suspected pre-fetches by corporate scanners or APMP. */}
      {(botFilteredOpenCount > 0 || botFilteredClickCount > 0) && (
        <div
          style={{
            marginBottom: 24,
            padding: 12,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            color: 'var(--text-3)',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: 'var(--text-2)' }}>Bot-filter:</strong>{' '}
          excluded {botFilteredOpenCount > 0 && `${botFilteredOpenCount.toLocaleString()} open${botFilteredOpenCount === 1 ? '' : 's'}`}
          {botFilteredOpenCount > 0 && botFilteredClickCount > 0 && ' and '}
          {botFilteredClickCount > 0 && `${botFilteredClickCount.toLocaleString()} click${botFilteredClickCount === 1 ? '' : 's'}`}
          {' '}from the stats above. These fired within 30 seconds of delivery with no user-agent — the signature
          of corporate email security scanners (Microsoft Defender, Mimecast, Proofpoint, etc.) or
          Apple Mail Privacy Protection pre-fetching links. Real recipient activity is preserved.
        </div>
      )}

      {/* RE-SEND PANEL — only for kind='post' with an existing post */}
      {canResend && (
        <ResendPanel
          postId={sendRow.post_id!}
          postTitle={sendRow.posts!.title}
          subscribers={subscribers}
          buttonLabel="Re-send to a different audience →"
          intro="Send this article again to any audience selection. A new entry is created in the send log; this one is preserved."
        />
      )}

      {/* Top clicked links */}
      {clicksRanked.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={sectionH}>Top clicked links</h2>
          <div className="admin-table-scroll" style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
                  <th style={th}>URL</th>
                  <th style={{ ...th, width: 140, textAlign: 'right' }}>Unique clickers</th>
                  <th style={{ ...th, width: 140, textAlign: 'right' }}>Total clicks</th>
                </tr>
              </thead>
              <tbody>
                {clicksRanked.map((row) => (
                  <tr key={row.url} style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ ...td, fontSize: 13, wordBreak: 'break-all' }}>
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--text)', textDecoration: 'none' }}
                      >
                        {row.url}
                      </a>
                    </td>
                    <td style={{ ...td, fontWeight: 700, textAlign: 'right' }}>{row.uniqueClickers}</td>
                    <td style={{ ...td, color: 'var(--text-3)', textAlign: 'right' }}>{row.totalClicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recipients view (grouped + filtered + paginated). Pass FILTERED
          events so the per-recipient counts and filter pills match the
          stat cards above. Bot-filtered events (corporate-scanner/APMP
          pre-fetches) are excluded from this view; the small bot-filter
          note above tells the user how many were dropped. Raw events are
          still in the email_events table if needed for diagnostic SQL. */}
      {(() => {
        const filteredEvents = events.filter((ev) => {
          if (ev.event_type !== 'opened' && ev.event_type !== 'clicked') return true;
          return !botExclusions.has(eventKey(ev));
        });
        return (
          <div>
            <h2 style={sectionH}>Recipients ({new Set(filteredEvents.map((e) => e.email)).size.toLocaleString()})</h2>
            <SendEventsTable events={filteredEvents} />
          </div>
        );
      })()}

      <p style={{ marginTop: 16, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
        Top clicked links is sorted by unique clickers (one row per recipient even if they clicked twice).
        The recipients table groups all events by email — click a row to expand the full event timeline for that person.
        Bot-filter is active: when one recipient fires multiple click or open events at the exact same
        millisecond, that&apos;s the signature of a corporate email security scanner or Apple Mail Privacy
        Protection issuing parallel link fetches, and those events are excluded. Single isolated events
        (real humans, who can&apos;t physically click two links in the same millisecond) are preserved.
      </p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 18px' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent || 'var(--text)' }}>{value}</div>
    </div>
  );
}

const sectionH: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--text)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 12,
};

const th: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const td: React.CSSProperties = { padding: '12px 14px', fontSize: 14, verticalAlign: 'top' };
