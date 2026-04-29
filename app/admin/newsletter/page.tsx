import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Newsletter · Admin',
};

type SendRow = {
  id: string;
  post_id: string;
  sent_at: string;
  recipient_count: number;
  failed_count: number;
  status: string;
  notes: string | null;
  posts?: { title: string; slug: string } | null;
};

export default async function NewsletterAdminPage() {
  const { data } = await supabaseAdmin
    .from('newsletter_sends')
    .select('*, posts(title, slug)')
    .order('sent_at', { ascending: false });

  const sends = (data as SendRow[]) || [];

  return (
    <div style={{ padding: 32, maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>Newsletter</h1>
      <p style={{ color: 'var(--text-2)', marginBottom: 32 }}>
        Log of every email blast. Newsletters are auto-sent when you publish a post (with the "Send to subscribers" toggle on),
        or you can manually re-send from the post editor.
      </p>

      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
              <th style={th}>Sent</th>
              <th style={th}>Article</th>
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
                  {s.posts ? (
                    <Link
                      href={`/articles/${s.posts.slug}`}
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
            No newsletter sends yet.
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
