'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Subscriber } from '@/lib/supabase';

type Stats = { total: number; confirmed: number; pending: number; unsubscribed: number };

export function SubscribersClient({ subscribers, stats }: { subscribers: Subscriber[]; stats: Stats }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'pending' | 'unsubscribed'>('all');

  const visible = subscribers.filter((s) => {
    if (filter !== 'all' && s.status !== filter) return false;
    if (search && !s.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function handleAction(id: string, action: 'resend_confirmation' | 'unsubscribe' | 'delete') {
    if (action === 'delete' && !confirm('Delete this subscriber permanently?')) return;
    const res = await fetch(`/api/admin/subscribers/${id}`, {
      method: action === 'delete' ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: action === 'delete' ? undefined : JSON.stringify({ action }),
    });
    if (res.ok) router.refresh();
    else alert('Action failed.');
  }

  function exportCSV() {
    const rows = [
      ['email', 'status', 'subscribed_at', 'confirmed_at', 'unsubscribed_at', 'source', 'last_sent_at'],
      ...subscribers.map((s) => [
        s.email,
        s.status,
        s.subscribed_at,
        s.confirmed_at || '',
        s.unsubscribed_at || '',
        s.source || '',
        s.last_sent_at || '',
      ]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subscribers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: 32, maxWidth: 1280, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>Subscribers</h1>
      <p style={{ color: 'var(--text-2)', marginBottom: 32 }}>
        Newsletter subscribers. Confirmed users receive the weekly Monday article.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total', value: stats.total },
          { label: 'Confirmed', value: stats.confirmed, color: 'var(--neon)' },
          { label: 'Pending', value: stats.pending, color: '#ffb84d' },
          { label: 'Unsubscribed', value: stats.unsubscribed, color: 'var(--text-3)' },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div style={{ fontSize: 32, fontWeight: 700, color: s.color || 'var(--text)' }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          placeholder="Search by email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
          style={{ flex: 1, minWidth: 240, maxWidth: 360 }}
        />
        {(['all', 'confirmed', 'pending', 'unsubscribed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="btn btn-ghost"
            style={{
              padding: '8px 14px',
              fontSize: 13,
              background: filter === f ? 'var(--neon)' : undefined,
              color: filter === f ? '#000' : undefined,
              borderColor: filter === f ? 'var(--neon)' : undefined,
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <Link
          href="/admin/subscribers/import"
          className="btn btn-ghost"
          style={{ padding: '8px 14px', fontSize: 13, marginLeft: 'auto', textDecoration: 'none' }}
        >
          + Import
        </Link>
        <button onClick={exportCSV} className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }}>
          Export CSV
        </button>
      </div>

      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
              <th style={th}>Email</th>
              <th style={th}>Status</th>
              <th style={th}>Source</th>
              <th style={th}>Subscribed</th>
              <th style={th}>Last Sent</th>
              <th style={{ ...th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={td}>{s.email}</td>
                <td style={td}>
                  <StatusBadge status={s.status} />
                </td>
                <td style={{ ...td, color: 'var(--text-3)', fontSize: 12 }}>{s.source || '—'}</td>
                <td style={{ ...td, color: 'var(--text-3)', fontSize: 12 }}>{formatDate(s.subscribed_at)}</td>
                <td style={{ ...td, color: 'var(--text-3)', fontSize: 12 }}>{s.last_sent_at ? formatDate(s.last_sent_at) : '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {s.status === 'pending' && (
                    <button onClick={() => handleAction(s.id, 'resend_confirmation')} style={actionBtn}>
                      Resend
                    </button>
                  )}
                  {s.status !== 'unsubscribed' && (
                    <button onClick={() => handleAction(s.id, 'unsubscribe')} style={actionBtn}>
                      Unsub
                    </button>
                  )}
                  <button onClick={() => handleAction(s.id, 'delete')} style={{ ...actionBtn, color: '#ff6b6b' }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>
            No subscribers match.
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    confirmed: { bg: 'rgba(196,255,61,0.15)', fg: 'var(--neon)' },
    pending: { bg: 'rgba(255,184,77,0.15)', fg: '#ffb84d' },
    unsubscribed: { bg: 'rgba(255,255,255,0.06)', fg: 'var(--text-3)' },
    bounced: { bg: 'rgba(255,107,107,0.15)', fg: '#ff6b6b' },
  };
  const c = colors[status] || colors.pending;
  return (
    <span
      style={{
        display: 'inline-block',
        background: c.bg,
        color: c.fg,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 100,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {status}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const th: React.CSSProperties = { padding: '14px 16px', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' };
const td: React.CSSProperties = { padding: '14px 16px', fontSize: 14 };
const actionBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--line-2)',
  color: 'var(--text-2)',
  padding: '5px 10px',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
  marginLeft: 6,
  fontFamily: 'inherit',
};
