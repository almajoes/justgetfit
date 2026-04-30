import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

  // Compute site-wide averages across completed sends.
  // Denominator = total recipients (excluding failed) so the rate is "of emails that actually delivered".
  const completedSends = sends.filter((s) => s.status === 'completed');
  const totalRecipients = completedSends.reduce((sum, s) => sum + (s.recipient_count - s.failed_count), 0);
  const totalOpens = completedSends.reduce((sum, s) => sum + (s.opened_count || 0), 0);
  const totalClicks = completedSends.reduce((sum, s) => sum + (s.clicked_count || 0), 0);
  const avgOpenRate = pct(totalOpens, totalRecipients);
  const avgClickRate = pct(totalClicks, totalRecipients);

  return (
    <div style={{ padding: 32, maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>Send log</h1>
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
          <SummaryCard label="Total recipients" value={totalRecipients.toLocaleString()} />
          <SummaryCard label="Avg. open rate" value={avgOpenRate} accent="var(--neon)" />
          <SummaryCard label="Avg. click rate" value={avgClickRate} accent="var(--neon)" />
        </div>
      )}

      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
              <th style={th}>Sent</th>
              <th style={th}>Type</th>
              <th style={th}>Subject / Article</th>
              <th style={th}>Recipients</th>
              <th style={th}>Failed</th>
              <th style={th}>Opens</th>
              <th style={th}>Clicks</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {sends.map((s) => {
              const delivered = s.recipient_count - s.failed_count;
              const openRate = pct(s.opened_count || 0, delivered);
              const clickRate = pct(s.clicked_count || 0, delivered);
              return (
                <tr key={s.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ ...td, color: 'var(--text-3)', fontSize: 13 }}>
                    {new Date(s.sent_at).toLocaleString()}
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
                    {s.kind === 'broadcast' ? (
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                        {s.subject || '(no subject)'}
                      </span>
                    ) : s.posts ? (
                      <Link
                        href={s.posts.category ? `/articles/${s.posts.category}/${s.posts.slug}` : `/articles`}
                        style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {s.posts.title}
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--text-3)' }}>(deleted post)</span>
                    )}
                  </td>
                  <td style={{ ...td, fontWeight: 600 }}>{s.recipient_count}</td>
                  <td style={{ ...td, color: s.failed_count > 0 ? '#ff6b6b' : 'var(--text-3)' }}>
                    {s.failed_count}
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{s.opened_count || 0}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{openRate}</div>
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{s.clicked_count || 0}</div>
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
        Open rates are tracked via a 1×1 pixel. Apple Mail Privacy Protection (default on iPhone) pre-loads
        all images including this pixel — so opens get counted even when the user didn&apos;t actually open the
        email. Treat opens as a soft trend signal, not absolute truth. Click rates are reliable — they fire
        only on real clicks.
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
