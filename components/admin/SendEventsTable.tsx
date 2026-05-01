'use client';

import { useMemo, useState } from 'react';

/**
 * <SendEventsTable />
 *
 * Recipient-grouped view of email_events for a single newsletter_send.
 *
 * One row per recipient (collapsed by default). Click a row → expand to see
 * the full chronological event timeline for that person + clicked URLs.
 *
 * Features:
 *  - Email substring search
 *  - Status filter pills with counts: All / Opened / Clicked / Bounced /
 *    Complained / No activity (sent or delivered but never opened)
 *  - Sortable columns: Email (alpha), Last activity (recency), Status (logical
 *    order: clicked → opened → bounced → complained → no-activity)
 *  - Pagination at 50/page; resets to page 1 when filter/search changes
 *
 * Why client-side: the parent page is a server component (RSC) but search,
 * sort, and pagination need interactivity. The events array is passed in once
 * as a prop; all filtering/sorting happens in-browser. At ~5,000 recipients
 * with maybe 4-6 events each (~30k events), this is well within memory budget
 * for a desktop browser. If sends ever grow past ~50k recipients consider
 * paginating server-side instead.
 */

type EventRow = {
  id: string;
  event_type: string;
  email: string;
  link_url: string | null;
  user_agent: string | null;
  occurred_at: string;
};

type RecipientStatus = 'clicked' | 'opened' | 'bounced' | 'complained' | 'no-activity';

type Recipient = {
  email: string;
  events: EventRow[];           // sorted oldest → newest
  lastActivity: string;          // ISO timestamp of most recent event
  hasOpened: boolean;
  hasClicked: boolean;
  hasBounced: boolean;
  hasComplained: boolean;
  clickedUrls: string[];         // unique URLs the recipient clicked
  status: RecipientStatus;       // derived "primary" status for filtering
};

type SortKey = 'email' | 'last_activity' | 'status';
type SortDir = 'asc' | 'desc';
type FilterKey = 'all' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'no-activity';

const PAGE_SIZE = 50;

// Logical sort order for "Status" column — surfaces the most engaged people first.
// Lower number = sorts earlier in `asc` direction.
const STATUS_SORT_ORDER: Record<RecipientStatus, number> = {
  clicked: 0,
  opened: 1,
  bounced: 2,
  complained: 3,
  'no-activity': 4,
};

export function SendEventsTable({ events }: { events: EventRow[] }) {
  // ─── State ─────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('last_activity');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());

  // ─── Group events by recipient ─────────────────────────────────────
  const recipients = useMemo(() => groupByRecipient(events), [events]);

  // ─── Status counts (used for filter pill badges) ───────────────────
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: recipients.length,
      opened: 0,
      clicked: 0,
      bounced: 0,
      complained: 0,
      'no-activity': 0,
    };
    for (const r of recipients) {
      if (r.hasClicked) c.clicked++;
      if (r.hasOpened) c.opened++;
      if (r.hasBounced) c.bounced++;
      if (r.hasComplained) c.complained++;
      if (r.status === 'no-activity') c['no-activity']++;
    }
    return c;
  }, [recipients]);

  // ─── Filter + search + sort pipeline ───────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipients.filter((r) => {
      if (q && !r.email.toLowerCase().includes(q)) return false;
      if (filter === 'all') return true;
      if (filter === 'opened') return r.hasOpened;
      if (filter === 'clicked') return r.hasClicked;
      if (filter === 'bounced') return r.hasBounced;
      if (filter === 'complained') return r.hasComplained;
      if (filter === 'no-activity') return r.status === 'no-activity';
      return true;
    });
  }, [recipients, search, filter]);

  const sorted = useMemo(() => {
    const arr = filtered.slice();
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'email') cmp = a.email.localeCompare(b.email);
      else if (sortKey === 'last_activity')
        cmp = new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime();
      else if (sortKey === 'status')
        cmp = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // ─── Pagination (always reset to page 1 when filter/search/sort changes) ─
  // Computed; clamp to last valid page if the filter shrunk the list.
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ─── Handlers ──────────────────────────────────────────────────────
  function setFilterAndReset(f: FilterKey) {
    setFilter(f);
    setPage(1);
  }
  function setSearchAndReset(s: string) {
    setSearch(s);
    setPage(1);
  }
  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(k);
      // Reasonable default direction per column:
      //   email          → asc (alpha)
      //   last_activity  → desc (most recent first)
      //   status         → asc (most engaged first; STATUS_SORT_ORDER puts clicked=0)
      setSortDir(k === 'email' ? 'asc' : k === 'last_activity' ? 'desc' : 'asc');
    }
  }
  function toggleExpand(email: string) {
    setExpandedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }
  function expandAll() {
    setExpandedEmails(new Set(visible.map((r) => r.email)));
  }
  function collapseAll() {
    setExpandedEmails(new Set());
  }

  // ─── Render ────────────────────────────────────────────────────────
  if (recipients.length === 0) {
    return (
      <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13, textAlign: 'center', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12 }}>
        No tracking events yet. Opens and clicks will appear here as they arrive.
      </div>
    );
  }

  return (
    <div>
      {/* Search + filter row */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearchAndReset(e.target.value)}
          placeholder="Search by email…"
          className="input"
          style={{ flex: 1, minWidth: 220, maxWidth: 360, fontSize: 13 }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <FilterPill label="All" count={counts.all} active={filter === 'all'} onClick={() => setFilterAndReset('all')} />
          <FilterPill label="Clicked" count={counts.clicked} active={filter === 'clicked'} onClick={() => setFilterAndReset('clicked')} accent="var(--neon)" />
          <FilterPill label="Opened" count={counts.opened} active={filter === 'opened'} onClick={() => setFilterAndReset('opened')} accent="var(--neon-2, #00e5ff)" />
          <FilterPill label="Bounced" count={counts.bounced} active={filter === 'bounced'} onClick={() => setFilterAndReset('bounced')} accent="#ff9b6b" />
          <FilterPill label="Complaints" count={counts.complained} active={filter === 'complained'} onClick={() => setFilterAndReset('complained')} accent="#ff6b6b" />
          <FilterPill label="No activity" count={counts['no-activity']} active={filter === 'no-activity'} onClick={() => setFilterAndReset('no-activity')} accent="var(--text-3)" />
        </div>
      </div>

      {/* Counts + expand/collapse all */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
          Showing <strong>{visible.length.toLocaleString()}</strong> of{' '}
          <strong>{sorted.length.toLocaleString()}</strong> recipient{sorted.length === 1 ? '' : 's'}
          {(search || filter !== 'all') && (
            <> · <button onClick={() => { setSearchAndReset(''); setFilterAndReset('all'); }} style={resetLinkStyle}>Clear filters</button></>
          )}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={expandAll} style={smallTextBtn}>Expand all on page</button>
          <button type="button" onClick={collapseAll} style={smallTextBtn}>Collapse all</button>
        </div>
      </div>

      {/* Recipient table */}
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
              <th style={{ ...th, width: 24 }}></th>
              <SortableHeader label="Recipient" colKey="email" current={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableHeader label="Status" colKey="status" current={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableHeader label="Last activity" colKey="last_activity" current={sortKey} dir={sortDir} onClick={toggleSort} />
              <th style={{ ...th, textAlign: 'right' }}>Events</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...td, textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>
                  No recipients match the current filters.
                </td>
              </tr>
            )}
            {visible.map((r) => {
              const expanded = expandedEmails.has(r.email);
              return (
                <RecipientRow
                  key={r.email}
                  recipient={r}
                  expanded={expanded}
                  onToggle={() => toggleExpand(r.email)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {totalPages > 1 && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1} style={pageBtn}>
            ← Previous
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-3)', padding: '0 12px' }}>
            Page {safePage} of {totalPages}
          </span>
          <button type="button" onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages} style={pageBtn}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Recipient row + expanded timeline ─────────────────────────────
function RecipientRow({ recipient, expanded, onToggle }: { recipient: Recipient; expanded: boolean; onToggle: () => void }) {
  const r = recipient;
  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          borderTop: '1px solid var(--line)',
          cursor: 'pointer',
          background: expanded ? 'rgba(196,255,61,0.03)' : 'transparent',
        }}
      >
        <td style={{ ...td, textAlign: 'center', color: 'var(--text-3)', fontSize: 11 }}>
          {expanded ? '▼' : '▶'}
        </td>
        <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{r.email}</td>
        <td style={td}>
          <StatusBadges r={r} />
        </td>
        <td style={{ ...td, color: 'var(--text-3)', fontSize: 12, whiteSpace: 'nowrap' }}>
          {new Date(r.lastActivity).toLocaleString()}
        </td>
        <td style={{ ...td, textAlign: 'right', color: 'var(--text-3)', fontSize: 12 }}>
          {r.events.length}
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderTop: '1px solid var(--line)', background: 'rgba(0,0,0,0.2)' }}>
          <td colSpan={5} style={{ padding: '14px 18px 18px 42px' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 10 }}>
              Event timeline (oldest first)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '8px 14px', alignItems: 'baseline' }}>
              {r.events.map((ev) => (
                <div key={ev.id} style={{ display: 'contents' }}>
                  <div style={{ color: 'var(--text-3)', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {new Date(ev.occurred_at).toLocaleString()}
                  </div>
                  <div>
                    <EventBadge type={ev.event_type} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', wordBreak: 'break-all' }}>
                    {ev.link_url ? (
                      <a href={ev.link_url} target="_blank" rel="noreferrer" style={{ color: 'var(--neon)', textDecoration: 'none' }}>
                        {ev.link_url}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-3)' }}>—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Status badges shown inline on the recipient row ───────────────
function StatusBadges({ r }: { r: Recipient }) {
  // Show only meaningful states. "Sent" and "Delivered" are implied by row's
  // existence — we surface only the engaged/error states.
  const hasAny = r.hasClicked || r.hasOpened || r.hasBounced || r.hasComplained;
  if (!hasAny) {
    return (
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>
        no activity
      </span>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {r.hasClicked && <EventBadge type="clicked" />}
      {r.hasOpened && <EventBadge type="opened" />}
      {r.hasBounced && <EventBadge type="bounced" />}
      {r.hasComplained && <EventBadge type="complained" />}
    </div>
  );
}

function EventBadge({ type }: { type: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    sent: { bg: 'rgba(255,255,255,0.06)', fg: 'var(--text-2)' },
    delivered: { bg: 'rgba(196,255,61,0.10)', fg: 'var(--neon)' },
    delivery_delayed: { bg: 'rgba(255,184,77,0.15)', fg: '#ffb84d' },
    opened: { bg: 'rgba(0,229,255,0.15)', fg: 'var(--neon-2, #00e5ff)' },
    clicked: { bg: 'rgba(196,255,61,0.20)', fg: 'var(--neon)' },
    bounced: { bg: 'rgba(255,107,107,0.15)', fg: '#ff6b6b' },
    complained: { bg: 'rgba(255,107,107,0.15)', fg: '#ff6b6b' },
  };
  const c = colors[type] || colors.sent;
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
      {type.replace('_', ' ')}
    </span>
  );
}

function FilterPill({ label, count, active, onClick, accent }: { label: string; count: number; active: boolean; onClick: () => void; accent?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 100,
        border: active ? `1px solid ${accent || 'var(--neon)'}` : '1px solid var(--line)',
        background: active ? `${accent || 'var(--neon)'}15` : 'transparent',
        color: active ? (accent || 'var(--neon)') : 'var(--text-2)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{count.toLocaleString()}</span>
    </button>
  );
}

function SortableHeader({ label, colKey, current, dir, onClick }: { label: string; colKey: SortKey; current: SortKey; dir: SortDir; onClick: (k: SortKey) => void }) {
  const isActive = current === colKey;
  return (
    <th
      style={{ ...th, cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onClick(colKey)}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <span style={{ opacity: isActive ? 1 : 0.3, fontSize: 9 }}>
          {isActive ? (dir === 'asc' ? '▲' : '▼') : '▲'}
        </span>
      </span>
    </th>
  );
}

// ─── Pure helper: group raw events by email into Recipient objects ─
function groupByRecipient(events: EventRow[]): Recipient[] {
  const byEmail = new Map<string, Recipient>();
  for (const ev of events) {
    let r = byEmail.get(ev.email);
    if (!r) {
      r = {
        email: ev.email,
        events: [],
        lastActivity: ev.occurred_at,
        hasOpened: false,
        hasClicked: false,
        hasBounced: false,
        hasComplained: false,
        clickedUrls: [],
        status: 'no-activity',
      };
      byEmail.set(ev.email, r);
    }
    r.events.push(ev);
    if (ev.event_type === 'opened') r.hasOpened = true;
    if (ev.event_type === 'clicked') {
      r.hasClicked = true;
      if (ev.link_url && !r.clickedUrls.includes(ev.link_url)) r.clickedUrls.push(ev.link_url);
    }
    if (ev.event_type === 'bounced') r.hasBounced = true;
    if (ev.event_type === 'complained') r.hasComplained = true;
    if (new Date(ev.occurred_at) > new Date(r.lastActivity)) r.lastActivity = ev.occurred_at;
  }
  // Sort each recipient's events oldest → newest, then derive primary status
  for (const r of byEmail.values()) {
    r.events.sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
    r.status = r.hasClicked
      ? 'clicked'
      : r.hasOpened
      ? 'opened'
      : r.hasBounced
      ? 'bounced'
      : r.hasComplained
      ? 'complained'
      : 'no-activity';
  }
  return Array.from(byEmail.values());
}

// ─── Inline styles ─────────────────────────────────────────────────
const th: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};
const td: React.CSSProperties = { padding: '12px 14px', fontSize: 14, verticalAlign: 'top' };
const pageBtn: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 100,
  border: '1px solid var(--line)',
  background: 'transparent',
  color: 'var(--text-2)',
  cursor: 'pointer',
};
const smallTextBtn: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-3)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '4px 8px',
  textDecoration: 'underline',
};
const resetLinkStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--neon)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  textDecoration: 'underline',
};
