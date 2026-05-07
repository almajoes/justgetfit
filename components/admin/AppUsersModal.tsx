'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatEasternDate } from '@/lib/format-date';

/**
 * <AppUsersModal />
 *
 * Modal that shows the list of app.justgetfit.org users — anyone with a
 * row in `public.profiles`. Each user reports their email, display name,
 * onboarding completion, current program status (if any), program start
 * date (if any), and signup date.
 *
 * Filters (button row at top):
 *   - All                  — every profile row
 *   - Active               — current program status = 'active'
 *   - Paused               — current program status = 'paused'
 *   - Onboarded, no program — completed onboarding but no active/paused program
 *   - Onboarding incomplete — started onboarding but completed_onboarding = false
 *
 * Data: GET /api/admin/app-users?page=N&pageSize=25&filter=X — paginated.
 * The API delegates to the `admin_list_app_users` RPC, which does the
 * auth.users × profiles × program_state join + filtering in a single query.
 */

type FilterKey = 'all' | 'active' | 'paused' | 'onboarded_no_program' | 'incomplete';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'onboarded_no_program', label: 'Onboarded, no program' },
  { key: 'incomplete', label: 'Onboarding incomplete' },
];

type AppUser = {
  user_id: string;
  email: string;
  display_name: string | null;
  completed_onboarding: boolean;
  program_status: string | null;
  program_started_at: string | null;
  signed_up_at: string;
};

type ApiResponse =
  | { ok: true; users: AppUser[]; total: number; page: number; pageSize: number; filter: FilterKey }
  | { error: string; hint?: string };

const PAGE_SIZE = 25;

export function AppUsersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const load = useCallback(
    async (pageNum: number, filterKey: FilterKey) => {
      setLoading(true);
      setError(null);
      setHint(null);
      try {
        const res = await fetch(
          `/api/admin/app-users?page=${pageNum}&pageSize=${PAGE_SIZE}&filter=${encodeURIComponent(filterKey)}`,
          { cache: 'no-store' }
        );
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
    },
    []
  );

  // Refetch on open. We reset to page 1 + filter 'all' every open so the
  // modal always lands in a known state.
  useEffect(() => {
    if (open) {
      setPage(1);
      setFilter('all');
      load(1, 'all');
    }
  }, [open, load]);

  // Refetch when filter or page changes (only while open). Filter changes
  // must reset page to 1, which we do via the click handler below.
  useEffect(() => {
    if (open) load(page, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter, open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(total, page * PAGE_SIZE);

  const activeFilterLabel = useMemo(
    () => FILTERS.find((f) => f.key === filter)?.label ?? 'All',
    [filter]
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="App users"
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
          maxWidth: 1080,
          color: 'var(--text)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>App users</h2>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '6px 0 0' }}>
              Subscribers who have at least started onboarding on app.justgetfit.org. Filter by their current state below.
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

        {/* Filter pill row */}
        <div
          role="tablist"
          aria-label="Filter app users"
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 18,
            marginBottom: 14,
          }}
        >
          {FILTERS.map((f) => {
            const isActive = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setFilter(f.key);
                  setPage(1);
                }}
                disabled={loading && isActive}
                style={{
                  background: isActive ? 'var(--neon)' : 'transparent',
                  color: isActive ? '#0b0d0a' : 'var(--text-2)',
                  border: `1px solid ${isActive ? 'var(--neon)' : 'var(--line)'}`,
                  borderRadius: 999,
                  padding: '6px 14px',
                  fontSize: 12.5,
                  fontWeight: isActive ? 700 : 500,
                  cursor: loading ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Status row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 8px', fontSize: 13, color: 'var(--text-3)' }}>
          <div>
            {loading && total === 0 ? (
              'Loading…'
            ) : total === 0 && !loading && !error ? (
              <>No users match <strong style={{ color: 'var(--text-2)' }}>{activeFilterLabel}</strong>.</>
            ) : (
              <>Showing <strong style={{ color: 'var(--text)' }}>{startIdx}–{endIdx}</strong> of <strong style={{ color: 'var(--text)' }}>{total}</strong></>
            )}
          </div>
          <button
            type="button"
            onClick={() => load(page, filter)}
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
                    <Th>Onboarding</Th>
                    <Th>Program</Th>
                    <Th>Program started</Th>
                    <Th>Signed up</Th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && !loading && (
                    <tr>
                      <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
                        No users to display.
                      </td>
                    </tr>
                  )}
                  {users.map((u) => (
                    <tr key={u.user_id} style={{ borderTop: '1px solid var(--line)' }}>
                      <Td mono>{u.email}</Td>
                      <Td>{u.display_name || <Dim>—</Dim>}</Td>
                      <Td>
                        <OnboardingPill done={u.completed_onboarding} />
                      </Td>
                      <Td>
                        {u.program_status ? <ProgramPill status={u.program_status} /> : <Dim>None</Dim>}
                      </Td>
                      <Td>
                        {u.program_started_at ? formatEasternDate(u.program_started_at) : <Dim>—</Dim>}
                      </Td>
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

function Dim({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--text-3)' }}>{children}</span>;
}

/**
 * ProgramPill — handles all program_state.status values, not just
 * active/paused. Color-coded so the status is scannable at a glance.
 */
function ProgramPill({ status }: { status: string }) {
  const colors = (() => {
    switch (status) {
      case 'active':
        return { bg: 'rgba(196,255,61,0.12)', fg: 'var(--neon)', border: 'rgba(196,255,61,0.3)', dot: 'var(--neon)' };
      case 'paused':
        return { bg: 'rgba(255,184,77,0.14)', fg: '#ffb84d', border: 'rgba(255,184,77,0.35)', dot: '#ffb84d' };
      case 'completed':
        return { bg: 'rgba(125,211,252,0.12)', fg: '#7dd3fc', border: 'rgba(125,211,252,0.3)', dot: '#7dd3fc' };
      case 'replaced':
      case 'archived':
      default:
        return { bg: 'rgba(255,255,255,0.05)', fg: 'var(--text-3)', border: 'var(--line)', dot: 'var(--text-3)' };
    }
  })();
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
        background: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.border}`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.dot }} />
      {status}
    </span>
  );
}

function OnboardingPill({ done }: { done: boolean }) {
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
        background: done ? 'rgba(196,255,61,0.10)' : 'rgba(255,255,255,0.04)',
        color: done ? 'var(--neon)' : 'var(--text-3)',
        border: `1px solid ${done ? 'rgba(196,255,61,0.25)' : 'var(--line)'}`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: done ? 'var(--neon)' : 'var(--text-3)',
        }}
      />
      {done ? 'Complete' : 'Incomplete'}
    </span>
  );
}
