'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatEasternDate } from '@/lib/format-date';

/**
 * <AppUsersModal />
 *
 * Modal that shows the list of subscribers currently using the
 * app.justgetfit.org app — defined as having a program_state row with
 * status IN ('active', 'paused'). Triggered by a button on
 * /admin/subscribers.
 *
 * Data: GET /api/admin/app-users?page=N&pageSize=25 — paginated. The API
 * delegates to the `admin_list_app_users` RPC, which does the
 * auth.users × profiles × program_state join in a single query.
 *
 * Auth: same admin gate as the rest of the admin surface (cookie session
 * checked by checkAdminAuth in the API route).
 */

type AppUser = {
  user_id: string;
  email: string;
  display_name: string | null;
  program_status: 'active' | 'paused';
  program_started_at: string | null;
  signed_up_at: string;
};

type ApiResponse = {
  ok: true;
  users: AppUser[];
  total: number;
  page: number;
  pageSize: number;
} | { error: string; hint?: string };

const PAGE_SIZE = 25;

export function AppUsersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const load = useCallback(async (pageNum: number) => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch(`/api/admin/app-users?page=${pageNum}&pageSize=${PAGE_SIZE}`, {
        cache: 'no-store',
      });
      const json: ApiResponse = await res.json();
      if (!res.ok || 'error' in json) {
        const j = json as { error: string; hint?: string };
        setError(j.error || `Request failed (${res.status})`);
        if (j.hint) setHint(j.hint);
        setUsers([]);
        setTotal(0);
      } else {
        setUsers(json.users);
        setTotal(json.total);
      }
    } catch (err: any) {
      setError(err?.message || 'Network error');
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch on open and on page change. We reset to page 1 every time the
  // modal opens so the user always lands on the most-recent starts.
  useEffect(() => {
    if (open) {
      setPage(1);
      load(1);
    }
  }, [open, load]);

  useEffect(() => {
    if (open) load(page);
  }, [page, open, load]);

  // Close on Escape — basic affordance for a modal that takes the screen.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(total, page * PAGE_SIZE);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Active app users"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '64px 20px 20px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: 28,
          width: '100%',
          maxWidth: 960,
          color: 'var(--text)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Active app users</h2>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '6px 0 0' }}>
              Subscribers with a current program (status active or paused) on app.justgetfit.org.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: '1px solid var(--line)',
              color: 'var(--text-2)',
              borderRadius: 8,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Close
          </button>
        </div>

        {/* Status row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 8px', fontSize: 13, color: 'var(--text-3)' }}>
          <div>
            {loading && total === 0 ? (
              'Loading…'
            ) : total === 0 && !loading && !error ? (
              'No active app users yet.'
            ) : (
              <>Showing <strong style={{ color: 'var(--text)' }}>{startIdx}–{endIdx}</strong> of <strong style={{ color: 'var(--text)' }}>{total}</strong></>
            )}
          </div>
          <button
            type="button"
            onClick={() => load(page)}
            disabled={loading}
            style={{
              background: 'transparent',
              border: '1px solid var(--line)',
              color: 'var(--text-2)',
              borderRadius: 8,
              padding: '4px 10px',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: 12,
            }}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: 'rgba(255,107,107,0.08)',
              border: '1px solid rgba(255,107,107,0.3)',
              borderRadius: 10,
              padding: 14,
              fontSize: 13,
              color: '#ff9c9c',
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 600 }}>Failed to load users</div>
            <div style={{ marginTop: 4, fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 }}>{error}</div>
            {hint && (
              <div style={{ marginTop: 8, color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 12 }}>
                <strong>Hint:</strong> {hint}
              </div>
            )}
          </div>
        )}

        {/* Table */}
        {!error && (
          <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-2)' }}>
                    <Th>Email</Th>
                    <Th>Display name</Th>
                    <Th>Program status</Th>
                    <Th>Program started</Th>
                    <Th>Signed up</Th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && !loading && (
                    <tr>
                      <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
                        No users to display.
                      </td>
                    </tr>
                  )}
                  {users.map((u) => (
                    <tr key={u.user_id} style={{ borderTop: '1px solid var(--line)' }}>
                      <Td mono>{u.email}</Td>
                      <Td>{u.display_name || <span style={{ color: 'var(--text-3)' }}>—</span>}</Td>
                      <Td>
                        <StatusPill status={u.program_status} />
                      </Td>
                      <Td>{u.program_started_at ? formatEasternDate(u.program_started_at) : <span style={{ color: 'var(--text-3)' }}>—</span>}</Td>
                      <Td>{formatEasternDate(u.signed_up_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {!error && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, fontSize: 13, color: 'var(--text-2)' }}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="btn btn-ghost"
              style={{ padding: '6px 14px', fontSize: 13, opacity: page === 1 ? 0.5 : 1 }}
            >
              ← Previous
            </button>
            <div>
              Page <strong style={{ color: 'var(--text)' }}>{page}</strong> of <strong style={{ color: 'var(--text)' }}>{totalPages}</strong>
            </div>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className="btn btn-ghost"
              style={{ padding: '6px 14px', fontSize: 13, opacity: page === totalPages ? 0.5 : 1 }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '10px 14px',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-3)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td
      style={{
        padding: '10px 14px',
        color: 'var(--text)',
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, monospace' : undefined,
        fontSize: mono ? 12.5 : undefined,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}

function StatusPill({ status }: { status: 'active' | 'paused' }) {
  const isActive = status === 'active';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 600,
        textTransform: 'capitalize',
        background: isActive ? 'rgba(196,255,61,0.12)' : 'rgba(255,184,77,0.14)',
        color: isActive ? 'var(--neon)' : '#ffb84d',
        border: `1px solid ${isActive ? 'rgba(196,255,61,0.3)' : 'rgba(255,184,77,0.35)'}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: isActive ? 'var(--neon)' : '#ffb84d',
        }}
      />
      {status}
    </span>
  );
}
