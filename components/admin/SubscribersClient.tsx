'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Subscriber } from '@/lib/supabase';

type Stats = { total: number; confirmed: number; pending: number; unsubscribed: number };

const PAGE_SIZE = 50;

export function SubscribersClient({ subscribers, stats }: { subscribers: Subscriber[]; stats: Stats }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'pending' | 'unsubscribed'>('all');
  const [page, setPage] = useState(1);
  // Sort state — pick a column and direction
  const [sortKey, setSortKey] = useState<'email' | 'status' | 'group' | 'subscribed'>('subscribed');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Bulk-select state. Set of subscriber IDs the user has ticked in the table.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Group filter — '__all' means no group filter applied. '__none' means show only ungrouped.
  // Any other value matches subscribers with that exact source/group label.
  const [groupFilter, setGroupFilter] = useState<string>('__all');

  // Compute distinct groups + counts for the dropdown.
  // We compute this from the FULL subscriber list (not the already-filtered one)
  // so the dropdown options stay stable as the user changes other filters.
  const groupOptions = (() => {
    const map = new Map<string, number>();
    let ungrouped = 0;
    for (const s of subscribers) {
      if (s.source && s.source.trim()) {
        const k = s.source.trim();
        map.set(k, (map.get(k) || 0) + 1);
      } else {
        ungrouped += 1;
      }
    }
    // Sort by count descending so the biggest groups appear first
    const named = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    return { named, ungrouped };
  })();

  const filtered = subscribers.filter((s) => {
    if (filter !== 'all' && s.status !== filter) return false;
    if (groupFilter === '__none') {
      if (s.source && s.source.trim()) return false;
    } else if (groupFilter !== '__all') {
      if ((s.source || '').trim() !== groupFilter) return false;
    }
    if (search && !s.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Sort the filtered list. Sorting is purely client-side — fine since the whole
  // subscriber list is loaded at page render time, and JS Array.sort handles 10k+
  // rows in milliseconds.
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'email') {
      cmp = a.email.localeCompare(b.email);
    } else if (sortKey === 'status') {
      // Custom order so confirmed > pending > unsubscribed feels natural rather than alphabetical
      const order: Record<string, number> = { confirmed: 0, pending: 1, unsubscribed: 2, bounced: 3 };
      cmp = (order[a.status] ?? 99) - (order[b.status] ?? 99);
    } else if (sortKey === 'group') {
      // NULL/empty groups sort last in asc, first in desc — common-sense behavior
      const ag = a.source || '';
      const bg = b.source || '';
      if (!ag && bg) cmp = 1;
      else if (ag && !bg) cmp = -1;
      else cmp = ag.localeCompare(bg);
    } else if (sortKey === 'subscribed') {
      cmp = new Date(a.subscribed_at).getTime() - new Date(b.subscribed_at).getTime();
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = sorted.slice(start, start + PAGE_SIZE);

  function setFilterAndReset(f: typeof filter) {
    setFilter(f);
    setPage(1);
  }
  function setSearchAndReset(s: string) {
    setSearch(s);
    setPage(1);
  }
  function setGroupFilterAndReset(g: string) {
    setGroupFilter(g);
    setPage(1);
  }

  // Click a column header to sort. Same column twice flips direction.
  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Sensible defaults per column: alphabetical → asc, dates → desc
      setSortDir(key === 'subscribed' ? 'desc' : 'asc');
    }
    setPage(1);
  }

  // === Bulk selection helpers ===
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((s) => next.add(s.id));
      return next;
    });
  }
  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((s) => next.add(s.id));
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  // Whether the current page is fully selected (controls the header checkbox state)
  const allVisibleSelected = visible.length > 0 && visible.every((s) => selected.has(s.id));
  const someVisibleSelected = visible.some((s) => selected.has(s.id));

  async function bulkRelabel() {
    if (selected.size === 0) return;
    const label = window.prompt(
      `Set group label for ${selected.size} subscriber${selected.size === 1 ? '' : 's'}?\n\nLeave empty to clear the label.`,
      ''
    );
    if (label === null) return; // user cancelled the prompt
    setBulkBusy(true);
    try {
      const res = await fetch('/api/admin/subscribers/bulk-relabel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), group_label: label }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Failed: ${data.error || res.statusText}`);
      } else {
        alert(`Updated ${data.updated} subscriber${data.updated === 1 ? '' : 's'}.`);
        clearSelection();
        router.refresh();
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleAction(
    id: string,
    action: 'resend_confirmation' | 'confirm' | 'unsubscribe' | 'delete'
  ) {
    if (action === 'delete' && !confirm('Delete this subscriber permanently? This is a hard delete — to keep their record on the list use Unsubscribe instead.')) return;
    if (action === 'confirm' && !confirm('Manually mark this subscriber as confirmed without sending the confirmation email?')) return;
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
          onChange={(e) => setSearchAndReset(e.target.value)}
          className="input"
          style={{ flex: 1, minWidth: 240, maxWidth: 360 }}
        />
        {(['all', 'confirmed', 'pending', 'unsubscribed'] as const).map((f) => {
          const count = f === 'all' ? stats.total : stats[f];
          return (
            <button
              key={f}
              onClick={() => setFilterAndReset(f)}
              className="btn btn-ghost"
              style={{
                padding: '8px 14px',
                fontSize: 13,
                background: filter === f ? 'var(--neon)' : undefined,
                color: filter === f ? '#000' : undefined,
                borderColor: filter === f ? 'var(--neon)' : undefined,
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}{' '}
              <span style={{ opacity: 0.7, fontWeight: 400 }}>({count})</span>
            </button>
          );
        })}

        {/* Group dropdown — '__all' is no filter, '__none' is ungrouped only */}
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilterAndReset(e.target.value)}
          className="input"
          style={{
            padding: '8px 12px',
            fontSize: 13,
            maxWidth: 240,
            cursor: 'pointer',
            // Highlight when an actual group filter is active
            borderColor: groupFilter !== '__all' ? 'var(--neon)' : undefined,
          }}
          title="Filter by group label"
        >
          <option value="__all">All groups ({stats.total})</option>
          {groupOptions.ungrouped > 0 && (
            <option value="__none">— No group ({groupOptions.ungrouped})</option>
          )}
          {groupOptions.named.length > 0 && <option disabled>──────────</option>}
          {groupOptions.named.map(([name, count]) => (
            <option key={name} value={name}>
              {name} ({count})
            </option>
          ))}
        </select>

        {groupFilter !== '__all' && (
          <button
            onClick={() => setGroupFilterAndReset('__all')}
            className="btn btn-ghost"
            style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-3)' }}
            title="Clear group filter"
          >
            ✕ Clear group
          </button>
        )}

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

      {/* Bulk action bar — appears when at least one subscriber is selected */}
      {selected.size > 0 && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            background: 'rgba(196,255,61,0.07)',
            border: '1px solid rgba(196,255,61,0.3)',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
            {selected.size} selected
          </span>
          <span style={{ flex: 1 }} />
          {filtered.length > visible.length && !filtered.every((s) => selected.has(s.id)) && (
            <button
              onClick={selectAllFiltered}
              className="btn btn-ghost"
              style={{ padding: '6px 12px', fontSize: 12 }}
            >
              Select all {filtered.length} matching
            </button>
          )}
          <button
            onClick={bulkRelabel}
            disabled={bulkBusy}
            className="btn btn-ghost"
            style={{ padding: '6px 12px', fontSize: 12, color: 'var(--neon)' }}
          >
            {bulkBusy ? 'Updating…' : 'Set group label'}
          </button>
          <button
            onClick={clearSelection}
            className="btn btn-ghost"
            style={{ padding: '6px 12px', fontSize: 12 }}
          >
            Clear selection
          </button>
        </div>
      )}

      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
              <th style={{ ...th, width: 36, paddingRight: 0 }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  // Indeterminate state when some but not all rows on this page are selected
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                  }}
                  onChange={() => {
                    if (allVisibleSelected) {
                      // Deselect just the current page
                      setSelected((prev) => {
                        const next = new Set(prev);
                        visible.forEach((s) => next.delete(s.id));
                        return next;
                      });
                    } else {
                      selectAllVisible();
                    }
                  }}
                  style={{ accentColor: 'var(--neon)', cursor: 'pointer' }}
                  title="Toggle all on this page"
                />
              </th>
              <th style={th}>
                <SortHeader label="Email" active={sortKey === 'email'} dir={sortDir} onClick={() => toggleSort('email')} />
              </th>
              <th style={th}>
                <SortHeader label="Status" active={sortKey === 'status'} dir={sortDir} onClick={() => toggleSort('status')} />
              </th>
              <th style={th}>
                <SortHeader label="Group" active={sortKey === 'group'} dir={sortDir} onClick={() => toggleSort('group')} />
              </th>
              <th style={th}>
                <SortHeader label="Subscribed" active={sortKey === 'subscribed'} dir={sortDir} onClick={() => toggleSort('subscribed')} />
              </th>
              <th style={th}>Last Sent</th>
              <th style={{ ...th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--line)', background: selected.has(s.id) ? 'rgba(196,255,61,0.04)' : undefined }}>
                <td style={{ ...td, width: 36, paddingRight: 0 }}>
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggleOne(s.id)}
                    style={{ accentColor: 'var(--neon)', cursor: 'pointer' }}
                  />
                </td>
                <td style={td}>{s.email}</td>
                <td style={td}>
                  <StatusBadge status={s.status} />
                </td>
                <td style={{ ...td, color: 'var(--text-3)', fontSize: 12 }}>{s.source || '—'}</td>
                <td style={{ ...td, color: 'var(--text-3)', fontSize: 12 }}>{formatDate(s.subscribed_at)}</td>
                <td style={{ ...td, color: 'var(--text-3)', fontSize: 12 }}>{s.last_sent_at ? formatDate(s.last_sent_at) : '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {s.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleAction(s.id, 'confirm')}
                        style={{ ...actionBtn, color: 'var(--neon)' }}
                        title="Manually mark this subscriber as confirmed without sending the email"
                      >
                        Confirm
                      </button>
                      <button onClick={() => handleAction(s.id, 'resend_confirmation')} style={actionBtn}>
                        Resend
                      </button>
                    </>
                  )}
                  {s.status === 'unsubscribed' && (
                    <button
                      onClick={() => handleAction(s.id, 'confirm')}
                      style={{ ...actionBtn, color: 'var(--neon)' }}
                      title="Move this subscriber back to confirmed (use only if they explicitly asked to be re-subscribed)"
                    >
                      Re-subscribe
                    </button>
                  )}
                  {s.status === 'confirmed' && (
                    <button onClick={() => handleAction(s.id, 'unsubscribe')} style={actionBtn}>
                      Unsub
                    </button>
                  )}
                  <button
                    onClick={() => handleAction(s.id, 'delete')}
                    style={{ ...actionBtn, color: '#ff6b6b' }}
                    title="Hard delete — removes the row permanently. Prefer Unsub to keep the record."
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>
            {filter === 'unsubscribed'
              ? 'No unsubscribed subscribers yet — nobody has opted out.'
              : filter === 'pending'
              ? 'No pending subscribers — everyone has confirmed.'
              : 'No subscribers match.'}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div
          style={{
            marginTop: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Showing {start + 1}&ndash;{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
            {filtered.length !== subscribers.length && ` (filtered from ${subscribers.length} total)`}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setPage(safePage - 1)}
              disabled={safePage <= 1}
              className="btn btn-ghost"
              style={{ padding: '6px 12px', fontSize: 13 }}
            >
              ← Previous
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-2)', padding: '0 8px' }}>
              Page {safePage} of {totalPages}
            </span>
            <button
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= totalPages}
              className="btn btn-ghost"
              style={{ padding: '6px 12px', fontSize: 13 }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0,
        cursor: 'pointer',
        font: 'inherit',
        color: 'inherit',
        textTransform: 'inherit',
        letterSpacing: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        opacity: active ? 1 : 0.85,
      }}
      title={`Sort by ${label}`}
    >
      {label}
      <span style={{ fontSize: 9, opacity: active ? 1 : 0.4, color: active ? 'var(--neon)' : 'inherit' }}>
        {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </button>
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
