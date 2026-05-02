'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useTransition } from 'react';

type Message = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  read_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
};

type Filter = 'inbox' | 'archived' | 'deleted';

type Counts = {
  inbox: number;
  archived: number;
  deleted: number;
  unread: number;
};

/**
 * InboxClient
 *
 * Renders the messages list directly from the `initialMessages` prop. NO local
 * state for the message list — earlier version held messages in useState() and
 * had a classic React stale-state bug where Link navigation between filter
 * tabs (Inbox/Archived/Deleted) would re-render with new initialMessages, but
 * useState only initializes once so the old list stayed visible.
 *
 * Action flow:
 *   1. User clicks an action (read/archive/delete/etc).
 *   2. We POST to /api/admin/inbox/action and await the response.
 *   3. On success, router.refresh() forces the server component to re-fetch
 *      from Supabase. The new initialMessages prop comes in, the list updates.
 *
 * Why no optimistic UI: the round-trip to the API is fast enough (<200ms in
 * practice) and trying to do optimistic updates is what caused the stale-list
 * bug. Snappy enough without the complexity.
 *
 * The only piece of local state is `expandedId` — which row's body is open.
 * That's a pure UI concern, not data.
 */
export function InboxClient({
  initialMessages,
  filter,
  counts,
}: {
  initialMessages: Message[];
  filter: Filter;
  counts: Counts;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function callAction(id: string, action: string) {
    setBusyId(id);
    try {
      const res = await fetch('/api/admin/inbox/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
        cache: 'no-store',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Action failed: ${j.error || res.statusText}`);
      }
    } catch (err) {
      console.error('[inbox] action error:', err);
      alert('Network error — please try again.');
    } finally {
      setBusyId(null);
      // Force a fresh server fetch — picks up the new state
      startTransition(() => router.refresh());
    }
  }

  function handleExpand(msg: Message) {
    const isExpanding = expandedId !== msg.id;
    setExpandedId(isExpanding ? msg.id : null);

    // Auto-mark as read on first expand if unread
    if (isExpanding && !msg.read_at && filter === 'inbox') {
      callAction(msg.id, 'read');
    }
  }

  function handleArchive(id: string) {
    if (expandedId === id) setExpandedId(null);
    callAction(id, 'archive');
  }

  function handleUnarchive(id: string) {
    if (expandedId === id) setExpandedId(null);
    callAction(id, 'unarchive');
  }

  function handleDelete(id: string) {
    if (!confirm('Move this message to Deleted? You can recover it from the Deleted tab.')) return;
    if (expandedId === id) setExpandedId(null);
    callAction(id, 'delete');
  }

  function handleRestore(id: string) {
    if (expandedId === id) setExpandedId(null);
    callAction(id, 'restore');
  }

  function handlePurge(id: string, name: string) {
    // Two-prompt confirm — this is irreversible. First click of the prompt
    // would be too easy to mis-click. Force the user to read the second one.
    if (!confirm(`Permanently delete the message from ${name}?\n\nThis CANNOT be undone — the row is removed from the database for good.`)) {
      return;
    }
    if (!confirm('Are you absolutely sure? Last chance to cancel.')) {
      return;
    }
    if (expandedId === id) setExpandedId(null);
    callAction(id, 'purge');
  }

  function handleToggleRead(msg: Message) {
    callAction(msg.id, msg.read_at ? 'unread' : 'read');
  }

  return (
    <div className="admin-page-pad" style={{ padding: 32, maxWidth: 1080, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
          Inbox
        </h1>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
          Contact form submissions
        </div>
      </div>

      {/* Filter pills */}
      <div className="admin-filter-row" style={{ display: 'flex', gap: 8, marginBottom: 24, marginTop: 16, alignItems: 'center' }}>
        <FilterPill href="/admin/inbox" active={filter === 'inbox'} count={counts.inbox} unread={counts.unread}>
          Inbox
        </FilterPill>
        <FilterPill href="/admin/inbox?filter=archived" active={filter === 'archived'} count={counts.archived}>
          Archived
        </FilterPill>
        <FilterPill href="/admin/inbox?filter=deleted" active={filter === 'deleted'} count={counts.deleted}>
          Deleted
        </FilterPill>

        {/* Empty trash — bulk hard-delete every message in Deleted */}
        {filter === 'deleted' && initialMessages.length > 0 && (
          <button
            onClick={async () => {
              if (!confirm(`Permanently delete ALL ${initialMessages.length} message${initialMessages.length === 1 ? '' : 's'} in Deleted?\n\nThis CANNOT be undone — every row is removed from the database for good.`)) return;
              if (!confirm('Last chance — empty the trash for real?')) return;
              // Sequential rather than parallel to avoid hammering the DB.
              // At realistic inbox sizes this is < 50 rows so latency is fine.
              for (const m of initialMessages) {
                try {
                  await fetch('/api/admin/inbox/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: m.id, action: 'purge' }),
                    cache: 'no-store',
                  });
                } catch (err) {
                  console.error('[inbox] empty trash item failed:', err);
                }
              }
              startTransition(() => router.refresh());
            }}
            className="btn"
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              padding: '6px 12px',
              background: 'rgba(255,107,107,0.1)',
              border: '1px solid rgba(255,107,107,0.3)',
              color: '#ff6b6b',
              borderRadius: 100,
              fontWeight: 600,
            }}
            title="Permanently delete every message currently in Deleted"
          >
            🗑 Empty trash
          </button>
        )}
      </div>

      {/* Empty state */}
      {initialMessages.length === 0 && (
        <div
          style={{
            padding: 48,
            textAlign: 'center',
            background: 'var(--bg-1)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            color: 'var(--text-3)',
          }}
        >
          {filter === 'inbox' && '📭 No new messages.'}
          {filter === 'archived' && 'No archived messages.'}
          {filter === 'deleted' && 'No deleted messages.'}
        </div>
      )}

      {/* Message list */}
      {initialMessages.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: isPending ? 0.6 : 1, transition: 'opacity 100ms' }}>
          {initialMessages.map((msg) => {
            const isExpanded = expandedId === msg.id;
            const isUnread = !msg.read_at && filter === 'inbox';
            const isBusy = busyId === msg.id;
            return (
              <div
                key={msg.id}
                style={{
                  background: isUnread ? 'rgba(196,255,61,0.04)' : 'var(--bg-1)',
                  border: `1px solid ${isUnread ? 'rgba(196,255,61,0.2)' : 'var(--line)'}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  transition: 'background 100ms',
                  opacity: isBusy ? 0.5 : 1,
                  pointerEvents: isBusy ? 'none' : 'auto',
                }}
              >
                {/* Header row */}
                <div
                  onClick={() => handleExpand(msg)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 12,
                    padding: '14px 18px',
                    cursor: 'pointer',
                    alignItems: 'center',
                  }}
                  className="admin-grid-rowstack"
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                      {isUnread && (
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            background: 'var(--neon)',
                            borderRadius: '50%',
                            flexShrink: 0,
                          }}
                          aria-label="Unread"
                        />
                      )}
                      <span style={{ fontWeight: isUnread ? 700 : 600, fontSize: 15 }}>{msg.name}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{msg.email}</span>
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <strong>{msg.subject || '(no subject)'}</strong>
                      <span style={{ color: 'var(--text-3)' }}> — {msg.message.slice(0, 100)}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                    {formatDate(msg.created_at)}
                  </div>
                </div>

                {/* Expanded body */}
                {isExpanded && (
                  <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--line)' }}>
                    <div style={{ marginTop: 16, marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                        Message
                      </div>
                      <p style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>
                        {msg.message}
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                      <a
                        href={`mailto:${encodeURIComponent(msg.email)}?subject=${encodeURIComponent('Re: ' + (msg.subject || 'Your message'))}`}
                        className="btn btn-primary"
                        style={{ fontSize: 13 }}
                      >
                        Reply
                      </a>

                      {filter === 'inbox' && (
                        <>
                          <button
                            onClick={() => handleToggleRead(msg)}
                            className="btn"
                            style={{ fontSize: 13, background: 'var(--bg-2)', border: '1px solid var(--line)' }}
                          >
                            Mark {msg.read_at ? 'unread' : 'read'}
                          </button>
                          <button
                            onClick={() => handleArchive(msg.id)}
                            className="btn"
                            style={{ fontSize: 13, background: 'var(--bg-2)', border: '1px solid var(--line)' }}
                          >
                            Archive
                          </button>
                          <button
                            onClick={() => handleDelete(msg.id)}
                            className="btn"
                            style={{ fontSize: 13, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', color: '#ff6b6b' }}
                          >
                            Delete
                          </button>
                        </>
                      )}

                      {filter === 'archived' && (
                        <>
                          <button
                            onClick={() => handleUnarchive(msg.id)}
                            className="btn"
                            style={{ fontSize: 13, background: 'var(--bg-2)', border: '1px solid var(--line)' }}
                          >
                            Unarchive
                          </button>
                          <button
                            onClick={() => handleDelete(msg.id)}
                            className="btn"
                            style={{ fontSize: 13, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', color: '#ff6b6b' }}
                          >
                            Delete
                          </button>
                        </>
                      )}

                      {filter === 'deleted' && (
                        <>
                          <button
                            onClick={() => handleRestore(msg.id)}
                            className="btn"
                            style={{ fontSize: 13, background: 'var(--bg-2)', border: '1px solid var(--line)' }}
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => handlePurge(msg.id, msg.name)}
                            className="btn"
                            style={{ fontSize: 13, background: 'rgba(255,107,107,0.15)', border: '1px solid rgba(255,107,107,0.4)', color: '#ff6b6b' }}
                            title="Permanently delete from database — cannot be undone"
                          >
                            Permanently delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  href,
  active,
  count,
  unread,
  children,
}: {
  href: string;
  active: boolean;
  count: number;
  unread?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px',
        borderRadius: 100,
        background: active ? 'rgba(196,255,61,0.1)' : 'var(--bg-1)',
        border: `1px solid ${active ? 'var(--neon)' : 'var(--line)'}`,
        color: active ? 'var(--neon)' : 'var(--text-2)',
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      <span>{children}</span>
      <span style={{ fontSize: 12, color: active ? 'var(--neon)' : 'var(--text-3)' }}>
        {count.toLocaleString()}
      </span>
      {unread !== undefined && unread > 0 && (
        <span
          style={{
            background: 'var(--neon)',
            color: 'var(--bg-0)',
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: 100,
            marginLeft: 2,
          }}
          aria-label={`${unread} unread`}
        >
          {unread}
        </span>
      )}
    </Link>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}
