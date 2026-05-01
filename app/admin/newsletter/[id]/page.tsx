import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ResendPanel } from '@/components/admin/ResendPanel';
import { SendEventsTable } from '@/components/admin/SendEventsTable';

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

type SubRow = {
  id: string;
  email: string;
  source: string | null;
  subscribed_at: string;
};

function pct(n: number, d: number): string {
  if (!d) return '—';
  return `${((n / d) * 100).toFixed(1)}%`;
}

/**
 * Pull all confirmed subscribers for the AudiencePicker inside ResendPanel.
 * Same paging strategy as /admin/broadcast/page.tsx — Supabase REST default
 * limit is 1,000 rows so we page with .range().
 *
 * Only called when the send is `kind='post'` (broadcasts can't be re-sent
 * via this endpoint — their content lives in newsletter_sends, not posts).
 */
async function loadConfirmedSubscribers(): Promise<SubRow[]> {
  const PAGE = 1000;
  let all: SubRow[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabaseAdmin
      .from('subscribers')
      .select('id, email, source, subscribed_at')
      .eq('status', 'confirmed')
      .order('subscribed_at', { ascending: false })
      .range(from, from + PAGE - 1);
    const batch = (data as SubRow[]) || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    from += PAGE;
    if (from > 200000) break; // safety bail
  }
  return all;
}

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

  // Fetch all events for this send, newest first
  const { data: eventsData } = await supabaseAdmin
    .from('email_events')
    .select('id, event_type, email, link_url, user_agent, occurred_at')
    .eq('send_id', params.id)
    .order('occurred_at', { ascending: false });
  const events = (eventsData as EventRow[]) || [];

  // Group by event type for the breakdown
  const byType: Record<string, EventRow[]> = {};
  for (const ev of events) {
    if (!byType[ev.event_type]) byType[ev.event_type] = [];
    byType[ev.event_type].push(ev);
  }

  // For clicks: count unique clicks per URL
  const clicksByUrl = new Map<string, { count: number; uniqueUsers: Set<string> }>();
  for (const ev of byType.clicked || []) {
    const url = ev.link_url || '(unknown URL)';
    if (!clicksByUrl.has(url)) clicksByUrl.set(url, { count: 0, uniqueUsers: new Set() });
    const entry = clicksByUrl.get(url)!;
    entry.count += 1;
    entry.uniqueUsers.add(ev.email);
  }
  const clicksRanked = Array.from(clicksByUrl.entries())
    .map(([url, { count, uniqueUsers }]) => ({ url, totalClicks: count, uniqueClickers: uniqueUsers.size }))
    .sort((a, b) => b.uniqueClickers - a.uniqueClickers);

  const delivered = sendRow.recipient_count - sendRow.failed_count;

  const titleLabel =
    sendRow.kind === 'broadcast'
      ? sendRow.subject || '(no subject)'
      : sendRow.posts?.title || '(deleted post)';

  // ResendPanel only available for kind='post' rows where the post still exists
  // (post_id non-null AND posts join returned data).
  const canResend = sendRow.kind === 'post' && sendRow.post_id && sendRow.posts;

  return (
    <div style={{ padding: 32, maxWidth: 1080, margin: '0 auto' }}>
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
        <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{new Date(sendRow.sent_at).toLocaleString()}</span>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 32, letterSpacing: '-0.02em' }}>
        {titleLabel}
      </h1>

      {/* Stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 32,
        }}
      >
        <Stat label="Recipients" value={sendRow.recipient_count.toLocaleString()} />
        <Stat label="Delivered" value={delivered.toLocaleString()} />
        <Stat label="Failed" value={sendRow.failed_count.toLocaleString()} accent={sendRow.failed_count > 0 ? '#ff6b6b' : undefined} />
        <Stat label="Unique opens" value={`${sendRow.opened_count} · ${pct(sendRow.opened_count, delivered)}`} accent="var(--neon)" />
        <Stat label="Unique clicks" value={`${sendRow.clicked_count} · ${pct(sendRow.clicked_count, delivered)}`} accent="var(--neon)" />
      </div>

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
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
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

      {/* Recipients view (grouped + filtered + paginated) */}
      <div>
        <h2 style={sectionH}>Recipients ({new Set(events.map((e) => e.email)).size.toLocaleString()})</h2>
        <SendEventsTable events={events} />
      </div>

      <p style={{ marginTop: 16, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
        Top clicked links is sorted by unique clickers (one row per recipient even if they clicked twice).
        The recipients table groups all events by email — click a row to expand the full event timeline for that person.
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
