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
  status: string;
  notes: string | null;
  posts?: { title: string; slug: string; category: string | null } | null;
};

export default async function NewsletterAdminPage() {
  const { data } = await supabaseAdmin
    .from('newsletter_sends')
    .select('*, posts(title, slug, category)')
    .order('sent_at', { ascending: false });

  const sends = (data as SendRow[]) || [];

  return (
    <div style={{ padding: 32, maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>Send log</h1>
      <p style={{ color: 'var(--text-2)', marginBottom: 32 }}>
        Every email blast — both <strong>post</strong> sends (auto-triggered when you publish an article) and <strong>broadcast</strong> messages (custom emails sent from <Link href="/admin/broadcast" style={{ color: 'var(--neon)' }}>the broadcast composer</Link>).
      </p>

      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
              <th style={th}>Sent</th>
              <th style={th}>Type</th>
              <th style={th}>Subject / Article</th>
              <th style={th}>Recipients</th>
              <th style={th}>Failed</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {sends.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ ...td, color: 'var(--text-3)', fontSize: 13 }}>
                  {new Date(s.sent_at).toLocaleString()}
                </td>
                <td style={td}>
                  <span
                    style={{
                      display: 'inline-block',
                      background: s.kind === 'broadcast' ? 'rgba(0,229,255,0.15)' : 'rgba(196,255,61,0.15)',
                      color: s.kind === 'broadcast' ? 'var(--neon-2)' : 'var(--neon)',
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
            ))}
          </tbody>
        </table>
        {sends.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>
            No emails sent yet.
          </div>
        )}
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
