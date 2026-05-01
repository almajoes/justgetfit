'use client';

import { useEffect, useState } from 'react';

/**
 * <JobProgress jobId={...} />
 *
 * Polls /api/admin/jobs/<id>/status every 2s and renders a progress bar.
 * Stops polling on terminal status (completed / failed / canceled).
 *
 * Used by:
 *   - BroadcastClient (after submitting a broadcast)
 *   - DraftEditor (after publishing with newsletter blast)
 */

type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

type StatusPayload = {
  id: string;
  kind: 'newsletter' | 'broadcast';
  subject: string;
  status: JobStatus;
  total_recipients: number;
  processed_count: number;
  failed_count: number;
  percent: number;
  started_at: string | null;
  completed_at: string | null;
  last_chunk_at: string | null;
  stalled: boolean;
  estimated_remaining_ms: number | null;
  error_message: string | null;
};

const TERMINAL: JobStatus[] = ['completed', 'failed', 'canceled'];

export function JobProgress({
  jobId,
  onDone,
}: {
  jobId: string;
  onDone?: (status: JobStatus) => void;
}) {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<null | 'cancel' | 'resume'>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/admin/jobs/${jobId}/status`, { cache: 'no-store' });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        const payload = (await res.json()) as StatusPayload;
        if (cancelled) return;
        setData(payload);
        setError(null);

        if (TERMINAL.includes(payload.status)) {
          if (onDone) onDone(payload.status);
          return; // stop polling
        }

        timer = setTimeout(tick, 2000);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Polling failed');
        timer = setTimeout(tick, 5000);
      }
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, onDone]);

  async function act(action: 'cancel' | 'resume') {
    if (action === 'cancel' && !confirm('Cancel this send? Already-sent emails cannot be recalled.')) {
      return;
    }
    setActing(action);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActing(null);
    }
  }

  if (!data && !error) {
    return (
      <div style={cardStyle}>
        <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Starting send…</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ ...cardStyle, borderColor: '#ff6b6b' }}>
        <div style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const isTerminal = TERMINAL.includes(data.status);
  const isRunning = data.status === 'running' || data.status === 'queued';
  const showResume = data.status === 'running' && data.stalled;

  const statusColor =
    data.status === 'completed'
      ? 'var(--neon)'
      : data.status === 'failed' || data.status === 'canceled'
      ? '#ff6b6b'
      : 'var(--text-2)';

  let etaLabel: string | null = null;
  if (data.estimated_remaining_ms != null && isRunning) {
    const sec = Math.round(data.estimated_remaining_ms / 1000);
    if (sec < 60) etaLabel = `~${sec}s remaining`;
    else if (sec < 3600) etaLabel = `~${Math.round(sec / 60)}m remaining`;
    else etaLabel = `~${(sec / 3600).toFixed(1)}h remaining`;
  }

  return (
    <div style={cardStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 12,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            {data.kind === 'broadcast' ? 'Broadcast send' : 'Newsletter send'}
          </div>
          {data.subject && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{data.subject}</div>}
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: statusColor,
          }}
        >
          {data.status}
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 10,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 999,
          overflow: 'hidden',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${data.percent}%`,
            background: data.status === 'failed' || data.status === 'canceled' ? '#ff6b6b' : 'var(--neon)',
            transition: 'width 400ms ease',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: 'var(--text-2)',
          marginBottom: 4,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <span>
          <strong>{data.processed_count.toLocaleString()}</strong> /{' '}
          {data.total_recipients.toLocaleString()} sent
          {data.failed_count > 0 && (
            <span style={{ color: '#ff9b6b', marginLeft: 8 }}>
              · {data.failed_count.toLocaleString()} failed
            </span>
          )}
        </span>
        <span>
          {data.percent.toFixed(1)}%{etaLabel ? ` · ${etaLabel}` : ''}
        </span>
      </div>

      {data.stalled && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 8,
            background: 'rgba(255,155,107,0.1)',
            border: '1px solid rgba(255,155,107,0.3)',
            fontSize: 12,
            color: '#ff9b6b',
          }}
        >
          ⚠ This send appears stalled (no progress in 10+ minutes). Click Resume to retry.
        </div>
      )}

      {data.status === 'completed' && (
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--neon)' }}>
          ✓ Send complete. {data.processed_count.toLocaleString()} processed
          {data.failed_count > 0 ? ` · ${data.failed_count.toLocaleString()} failed.` : '.'}
        </div>
      )}

      {data.status === 'failed' && (
        <div style={{ marginTop: 12, fontSize: 13, color: '#ff6b6b' }}>
          ✗ Send failed.{data.error_message ? ` ${data.error_message}` : ''}
        </div>
      )}

      {data.status === 'canceled' && (
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-3)' }}>
          Send canceled. {data.processed_count.toLocaleString()} of{' '}
          {data.total_recipients.toLocaleString()} were sent before cancellation.
        </div>
      )}

      {(isRunning || showResume) && (
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {showResume && (
            <button
              type="button"
              onClick={() => act('resume')}
              disabled={acting !== null}
              className="btn btn-primary"
              style={{ padding: '8px 14px', fontSize: 12 }}
            >
              {acting === 'resume' ? 'Resuming…' : '↻ Resume'}
            </button>
          )}
          {!isTerminal && (
            <button
              type="button"
              onClick={() => act('cancel')}
              disabled={acting !== null}
              className="btn btn-ghost"
              style={{ padding: '8px 14px', fontSize: 12 }}
            >
              {acting === 'cancel' ? 'Canceling…' : 'Cancel send'}
            </button>
          )}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#ff9b6b' }}>
          Polling error: {error} (retrying…)
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-1)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
};
