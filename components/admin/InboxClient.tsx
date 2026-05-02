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
 * Shows contact form submissions with filter pills (Inbox / Archived / Deleted),
 * a per-row expandable view, and per-row actions (mark read/unread, archive/
 * unarchive, delete/restore).
 *
 * Optimistic UI: when an action is clicked, we don't wait for the server. The
 * row updates locally (e.g. archive removes it from the list immediately) and
 * we hit the API in the background. If the API fails, we router.refresh() to
 * re-sync from the server. This makes the inbox feel snappy even on slower
 * connections.
 *
 * Auto-mark-read on expand: the first time a row is expanded, if it's unread,
 * we silently mark it read. Mirrors how Gmail/most mail clients behave.
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
  const [, startTransition] = useTransition();
  const [messages, setMessages] = useState(initialMessages);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function callAction(id: string, action: string) {
    try {
      const res = await fetch('/api/admin/inbox/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error('Action failed');
    } catch (err) {
      console.error('[inbox] action failed, refreshing:', err);
      // Re-fetch from server to undo any optimistic update
      router.refresh();
    }
  }

  function handleExpand(msg: Message) {
    const isExpanding = expandedId !== msg.id;
    setExpandedId(isExpanding ? msg.id : null);

    // Auto-mark as read on first expand if unread
    if (isExpanding && !msg.read_at) {
      const now = new Date().toISOString();
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, read_at: now } : m)));
      callAction(msg.id, 'read');
      // Refresh to update the unread badge
      startTransition(() => router.refresh());
    }
  }

  function handleArchive(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    if (expandedId === id) setExpandedId(null);
    callAction(id, 'archive');
    startTransition(() => router.refresh());
  }

  function handleUnarchive(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    if (expandedId === id) setExpandedId(null);
    callAction(id, 'unarchive');
    startTransition(() => router.refresh());
  }

  function handleDelete(id: string) {
    if (!confirm('Soft-delete this message? You can recover it from the Deleted tab.')) return;
    setMessages((prev) => prev.filter((m) => m.id !== id));
    if (expandedId === id) setExpandedId(null);
    callAction(id, 'delete');
    startTransition(() => router.refresh());
  }

  function handleRestore(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    if (expandedId === id) setExpandedId(null);
    callAction(id, 'restore');
    startTransition(() => router.refresh());
  }

  function handleToggleRead(msg: Message) {
    const wasRead = !!msg.read_at;
    const now = new Date().toISOString();
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, read_at: wasRead ? null : now } : m))
    );
    callAction(msg.id, wasRead ? 'unread' : 'read');
    startTransition(() => router.refresh());
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
      <div className="admin-filter-row" style={{ display: 'flex', gap: 8, marginBottom: 24, marginTop: 16 }}>
        <FilterPill href="/admin/inbox" active={filter === 'inbox'} count={counts.inbox} unread={counts.unread}>
          Inbox
        </FilterPill>
        <FilterPill href="/admin/inbox?filter=archived" active={filter === 'archived'} count={counts.archived}>
          Archived
        </FilterPill>
        <FilterPill href="/admin/inbox?filter=deleted" active={filter === 'deleted'} count={counts.deleted}>
          Deleted
        </FilterPill>
      </div>

      {/* Empty state */}
      {messages.length === 0 && (
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
      {messages.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.map((msg) => {
            const isExpanded = expandedId === msg.id;
            const isUnread = !msg.read_at && filter === 'inbox';
            return (
              <div
                key={msg.id}
                style={{
                  background: isUnread ? 'rgba(196,255,61,0.04)' : 'var(--bg-1)',
                  border: `1px solid ${isUnread ? 'rgba(196,255,61,0.2)' : 'var(--line)'}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  transition: 'background 100ms',
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
                        <button
                          onClick={() => handleRestore(msg.id)}
                          className="btn"
                          style={{ fontSize: 13, background: 'var(--bg-2)', border: '1px solid var(--line)' }}
                        >
                          Restore
                        </button>
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
