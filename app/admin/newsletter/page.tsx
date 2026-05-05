import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { TableHeaderTip } from '@/components/admin/TableHeaderTip';
import { RefreshSendStatsButton } from '@/components/admin/RefreshSendStatsButton';
import { formatEastern } from '@/lib/format-date';
import { computeBotExclusions, eventKey } from '@/lib/email-event-filter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata = {
  title: 'Send log · Admin',
};

type SendRow = {
  id: string;
  post_id: string | null;
  kind: 'post' | 'broadcast';
  subject: string | null;
  body_markdown: string | null;
  sent_at: string;
  recipient_count: number;
  failed_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  complained_count: number;
  status: string;
  notes: string | null;
  posts?: { title: string; slug: string; category: string | null } | null;
};

function pct(numerator: number, denominator: number): string {
  if (!denominator) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default async function NewsletterAdminPage() {
  const { data } = await supabaseAdmin
    .from('newsletter_sends')
    .select('*, posts(title, slug, category)')
    .order('sent_at', { ascending: false });

  const sends = (data as SendRow[]) || [];

  // Batch-load event stats for ALL sends in one query.
  // Per-send queries would be N round-trips; this is one round-trip total.
  // We then group in JS to build a stats map keyed by send_id.
  //
  // Why: cached counter columns on newsletter_sends (opened_count, etc.) can
  // become stale or wrong if the worker chain breaks mid-send (May 4 2026
  // incident). Counting events directly always matches Resend reality.
  type StatsBySend = Record<
    string,
    { sent: number; delivered: number; bounced: number; complained: number; opened: Set<string>; clicked: Set<string> }
  >;
  const statsBySend: StatsBySend = {};
  if (sends.length > 0) {
    // Page through email_events to bypass Supabase's default 1000-row limit
    // on .in() queries. Without this, sends after the first ~3-4 (depending
    // on event volume per send) get silently truncated and show 0 stats
    // instead of the real values, causing discrepancies with the detail page
    // which queries one send_id at a time.
    //
    // Pull user_agent + occurred_at as well — needed for the per-send bot
    // filter (excludes corporate-scanner and APMP pre-fetches from open/click
    // counts). See lib/email-event-filter.ts.
    const PAGE_SIZE = 1000;
    const sendIds = sends.map((s) => s.id);
    type RawEvent = {
      send_id: string | null;
      event_type: string;
      email: string;
      user_agent: string | null;
      occurred_at: string;
    };
    const allEvents: RawEvent[] = [];
    let from = 0;
    while (true) {
      const { data: page, error } = await supabaseAdmin
        .from('email_events')
        .select('send_id, event_type, email, id, user_agent, occurred_at')
        .in('send_id', sendIds)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        console.error('[send log] event pagination failed:', error.message);
        break;
      }
      const batch = page || [];
      for (const ev of batch) allEvents.push(ev as RawEvent);
      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
      if (from > 100000) break; // safety bail
    }

    // Group events per send so we can bot-filter each send independently.
    // (computeBotExclusions needs to compare opens/clicks against the
    // delivered timestamp from the SAME send for the SAME recipient.)
    const eventsBySend = new Map<string, RawEvent[]>();
    for (const ev of allEvents) {
      if (!ev.send_id) continue;
      if (!eventsBySend.has(ev.send_id)) eventsBySend.set(ev.send_id, []);
      eventsBySend.get(ev.send_id)!.push(ev);
    }

    for (const [sendId, evs] of eventsBySend.entries()) {
      const exclusions = computeBotExclusions(evs);
      statsBySend[sendId] = {
        sent: 0,
        delivered: 0,
        bounced: 0,
        complained: 0,
        opened: new Set(),
        clicked: new Set(),
      };
      const s = statsBySend[sendId];
      for (const ev of evs) {
        if (ev.event_type === 'sent') s.sent += 1;
        else if (ev.event_type === 'delivered') s.delivered += 1;
        else if (ev.event_type === 'bounced') s.bounced += 1;
        else if (ev.event_type === 'complained') s.complained += 1;
        else if (ev.event_type === 'opened') {
          if (!exclusions.has(eventKey(ev))) s.opened.add(ev.email);
        } else if (ev.event_type === 'clicked') {
          if (!exclusions.has(eventKey(ev))) s.clicked.add(ev.email);
        }
      }
    }
  }

  // Helper to get stats for a send (returns zeros if no events yet)
  function statsFor(sendId: string) {
    const s = statsBySend[sendId];
    return {
      sent: s?.sent ?? 0,
      delivered: s?.delivered ?? 0,
      bounced: s?.bounced ?? 0,
      complained: s?.complained ?? 0,
      opened: s?.opened.size ?? 0,
      clicked: s?.clicked.size ?? 0,
    };
  }

  // Compute site-wide averages across completed sends — all from event tallies.
  // Denominator = total DELIVERED events ("opens per inbox-arrival").
  const completedSends = sends.filter((s) => s.status === 'completed');
  const totalDelivered = completedSends.reduce((sum, s) => sum + statsFor(s.id).delivered, 0);
  const totalSent = completedSends.reduce((sum, s) => sum + statsFor(s.id).sent, 0);
  const totalOpens = completedSends.reduce((sum, s) => sum + statsFor(s.id).opened, 0);
  const totalClicks = completedSends.reduce((sum, s) => sum + statsFor(s.id).clicked, 0);
  const totalBounces = completedSends.reduce((sum, s) => sum + statsFor(s.id).bounced, 0);
  const totalComplaints = completedSends.reduce((sum, s) => sum + statsFor(s.id).complained, 0);
  const avgOpenRate = pct(totalOpens, totalDelivered);
  const avgClickRate = pct(totalClicks, totalDelivered);
  const avgBounceRate = pct(totalBounces, totalSent);
  const avgComplaintRate = pct(totalComplaints, totalDelivered);

  // Health-color thresholds for bounce + complaint rates (rough industry ballpark).
  const bouncePct = totalSent > 0 ? (totalBounces / totalSent) * 100 : 0;
  const complaintPct = totalDelivered > 0 ? (totalComplaints / totalDelivered) * 100 : 0;
  const bounceAccent = bouncePct >= 5 ? '#ff6b6b' : bouncePct >= 2 ? '#ff9b6b' : 'var(--text)';
  const complaintAccent = complaintPct >= 0.3 ? '#ff6b6b' : complaintPct >= 0.1 ? '#ff9b6b' : 'var(--text)';

  return (
    <div className="admin-page-pad" style={{ padding: 32, maxWidth: 1480, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Send log</h1>
        <RefreshSendStatsButton />
      </div>
      <p style={{ color: 'var(--text-2)', marginBottom: 32 }}>
        Every email blast — both <strong>post</strong> sends (auto-triggered when you publish an article) and <strong>broadcast</strong> messages (custom emails sent from <Link href="/admin/broadcast" style={{ color: 'var(--neon)' }}>the broadcast composer</Link>).
      </p>

      {/* Site-wide summary cards */}
      {completedSends.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 32,
          }}
        >
          <SummaryCard label="Total sends" value={String(completedSends.length)} />
          <SummaryCard label="Total delivered" value={totalDelivered.toLocaleString()} />
          <SummaryCard label="Avg. open rate" value={avgOpenRate} accent="var(--neon)" />
          <SummaryCard label="Avg. click rate" value={avgClickRate} accent="var(--neon)" />
          <SummaryCard label="Bounce rate" value={avgBounceRate} accent={bounceAccent} />
          <SummaryCard label="Complaint rate" value={avgComplaintRate} accent={complaintAccent} />
        </div>
      )}

      <div className="admin-table-scroll" style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
              <th style={th}>Sent</th>
              <th style={th}>Type</th>
              <th style={th}>Subject / Article</th>
              <th style={th}>
                <TableHeaderTip
                  label="Intended"
                  tip="Original audience size at send time — how many subscribers were selected to receive this email."
                />
              </th>
              <th style={th}>
                <TableHeaderTip
                  label="Actual"
                  tip="What Resend (our email provider) actually received and accepted from our server. Should match Intended unless the worker chain dropped subscribers mid-send — see the gap indicator in red below the count."
                />
              </th>
              <th style={th}>
                <TableHeaderTip
                  label="Delivered"
                  tip="Confirmed delivered to a recipient's inbox by their mail server. The percentage is of the Actual count."
                />
              </th>
              <th style={th}>
                <TableHeaderTip
                  label="Bounced"
                  tip="Permanent delivery failures (invalid address, mailbox full, server rejection). Soft bounces and temporary delays are NOT counted here. Industry health threshold: under 2%."
                />
              </th>
              <th style={th}>
                <TableHeaderTip
                  label="Complaints"
                  tip="Recipients who marked the email as spam in their mail client. Industry health threshold: under 0.1%. Higher rates can hurt sender reputation and future deliverability."
                />
              </th>
              <th style={th}>
                <TableHeaderTip
                  label="Openers"
                  tip="Unique recipients who opened the email at least once. Bot pre-fetches (corporate scanners and Apple Mail Privacy Protection firing within 30 seconds of delivery) are excluded. Real opens still inflated by APMP if the user actually opens the email — treat as a soft trend signal."
                />
              </th>
              <th style={th}>
                <TableHeaderTip
                  label="Clickers"
                  tip="Unique recipients who clicked at least one link in the email. Bot pre-fetches (corporate email security scanners like Microsoft Defender, Mimecast, Proofpoint that fire within 30 seconds of delivery with no user-agent) are excluded. Click-through rate is calculated against Delivered."
                />
              </th>
              <th style={th}>
                <TableHeaderTip
                  label="Status"
                  tip="Send job status. completed = all subscribers processed. sending = worker is mid-send. failed = job aborted (check the send detail page for error message)."
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {sends.map((s) => {
              const ev = statsFor(s.id);
              const sendGap = s.recipient_count - ev.sent;
              const openRate = pct(ev.opened, ev.delivered);
              const clickRate = pct(ev.clicked, ev.delivered);
              return (
                <tr key={s.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ ...td, color: 'var(--text-3)', fontSize: 13 }}>
                    {formatEastern(s.sent_at)}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        display: 'inline-block',
                        background: s.kind === 'broadcast' ? 'rgba(0,229,255,0.15)' : 'rgba(196,255,61,0.15)',
                        color: s.kind === 'broadcast' ? 'var(--neon-2, #00e5ff)' : 'var(--neon)',
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 100,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {s.kind || 'post'}
                    </span>
                  </td>
                  <td style={td}>
                    <Link href={`/admin/newsletter/${s.id}`} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}>
                      {s.kind === 'broadcast'
                        ? s.subject || '(no subject)'
                        : s.posts?.title || '(deleted post)'}
                    </Link>
                  </td>
                  <td style={{ ...td, fontWeight: 600 }}>{s.recipient_count.toLocaleString()}</td>
                  <td style={{ ...td, fontWeight: 600, color: sendGap > 0 ? '#ff9b6b' : 'var(--text)' }}>
                    {ev.sent.toLocaleString()}
                    {sendGap > 0 && (
                      <div style={{ fontSize: 11, color: '#ff6b6b' }}>
                        −{sendGap.toLocaleString()} gap
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, fontWeight: 600 }}>{ev.delivered.toLocaleString()}</td>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: ev.bounced > 0 ? '#ff9b6b' : 'var(--text-3)' }}>
                      {ev.bounced.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {pct(ev.bounced, ev.sent)}
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: ev.complained > 0 ? '#ff6b6b' : 'var(--text-3)' }}>
                      {ev.complained.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {pct(ev.complained, ev.delivered)}
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{ev.opened.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{openRate}</div>
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{ev.clicked.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{clickRate}</div>
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        display: 'inline-block',
                        background:
                          s.status === 'completed'
                            ? 'rgba(196,255,61,0.15)'
                            : s.status === 'failed'
                            ? 'rgba(255,107,107,0.15)'
                            : 'rgba(255,184,77,0.15)',
                        color:
                          s.status === 'completed'
                            ? 'var(--neon)'
                            : s.status === 'failed'
                            ? '#ff6b6b'
                            : '#ffb84d',
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 100,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {s.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sends.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>
            No emails sent yet.
          </div>
        )}
      </div>

      <p style={{ marginTop: 16, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-2)' }}>Why Delivered + Bounced doesn&apos;t always equal Actual:</strong>{' '}
        <em>Actual</em> is the count of messages Resend accepted from our server. <em>Delivered</em> is what landed in
        an inbox; <em>Bounced</em> is what Resend reported as a permanent failure. The gap is messages that are still
        in flight (recipient server queued/greylisted them) or in soft-bounce states Resend hasn&apos;t classified yet.
        Those typically resolve to delivered or bounced over the following hours, and the &ldquo;Refresh stats&rdquo;
        button on each send detail will pick up the latest events.
      </p>
      <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-2)' }}>About Openers and Clickers:</strong>{' '}
        Both stats exclude suspected bot pre-fetches — events that fire within 30 seconds of delivery with no
        user-agent are filtered out. This catches corporate email security scanners (Microsoft Defender,
        Mimecast, Proofpoint, Barracuda, etc.) that fetch every link to scan for malware, and Apple Mail Privacy
        Protection pre-fetches. Real human activity (clicks/opens after the 30-second window or with a real
        user-agent) is preserved. Note that APMP can still inflate Openers when a real user actually opens an
        email after the 30-second window, since APMP loads images at that point too — treat Openers as a soft
        trend signal, not absolute truth. Clickers are more reliable post-filter.
      </p>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: '16px 20px',
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-3)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent || 'var(--text)', letterSpacing: '-0.01em' }}>
        {value}
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};
const td: React.CSSProperties = { padding: '14px 16px', fontSize: 14 };
