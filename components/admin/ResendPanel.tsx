'use client';

import { useMemo, useState } from 'react';
import { JobProgress } from './JobProgress';
import {
  AudiencePicker,
  resolveAudience,
  defaultAudienceValue,
  type AudienceValue,
  type Subscriber,
} from './AudiencePicker';

/**
 * <ResendPanel>
 *
 * Re-send an already-published post to any audience selection. Used in two
 * places:
 *   - /admin/newsletter/[id]  → re-send from the send-log detail view
 *   - /admin/posts/[id]       → ad-hoc send from the post editor
 *
 * Behavior:
 *   - Starts collapsed (just a button); expands to show the AudiencePicker
 *     and a Send button.
 *   - On send, hits POST /api/admin/newsletter/send with { postId, audience }
 *   - On success, swaps to a <JobProgress> widget so the user can watch
 *     the send happen. Tab-close-safe — the worker keeps running.
 *   - "Re-send again" button after completion to fire another send.
 *
 * Server creates a NEW newsletter_sends row each call (with a `notes`
 * annotation) — the original send-log entry is never mutated, preserving
 * the audit trail.
 */
export function ResendPanel({
  postId,
  postTitle,
  subscribers,
  buttonLabel = 'Re-send this article →',
  intro = 'Send this article again to any audience. Useful for warm-up sends, A/B tests, or fulfilling individual requests.',
}: {
  postId: string;
  postTitle: string;
  subscribers: Subscriber[];
  buttonLabel?: string;
  intro?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [audience, setAudience] = useState<AudienceValue>(() => defaultAudienceValue());
  const [submitting, setSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const resolved = useMemo(() => resolveAudience(subscribers, audience), [subscribers, audience]);
  const recipientCount = resolved.recipientCount;

  async function send() {
    if (recipientCount === 0) {
      setError('No recipients selected — pick at least one subscriber.');
      return;
    }

    // Audience preview — server-side count of how many will actually be
    // sent to after the 7-day-throttle filter. Shown in the confirm dialog
    // so the user knows the real send size before firing.
    const audiencePayload =
      audience.mode === 'all'
        ? { mode: 'all' as const }
        : {
            mode: 'list' as const,
            subscriber_ids: resolved.recipients.map((r) => r.id),
          };

    let willSend = recipientCount;
    let throttled = 0;
    try {
      const previewBody =
        audiencePayload.mode === 'all'
          ? { mode: 'all' as const }
          : { mode: 'list' as const, ids: audiencePayload.subscriber_ids };
      const previewRes = await fetch('/api/admin/audience-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(previewBody),
      });
      if (previewRes.ok) {
        const preview: { selected: number; throttled: number; willSend: number } = await previewRes.json();
        willSend = preview.willSend;
        throttled = preview.throttled;
      }
    } catch {
      // proceed without preview if it fails
    }

    const confirmText =
      throttled > 0
        ? `Re-send "${postTitle}":\n\n` +
          `${recipientCount.toLocaleString()} subscribers selected.\n` +
          `${throttled.toLocaleString()} received a newsletter in the past 7 days and will be skipped (1-per-week throttle).\n\n` +
          `Sending to ${willSend.toLocaleString()} subscribers.\n\nThis cannot be undone.`
        : audience.mode === 'all'
        ? `Re-send "${postTitle}" to all ${recipientCount.toLocaleString()} confirmed subscriber${recipientCount === 1 ? '' : 's'}?\n\nThis cannot be undone.`
        : `Re-send "${postTitle}" to ${recipientCount.toLocaleString()} selected subscriber${recipientCount === 1 ? '' : 's'}?\n\nThis cannot be undone.`;
    if (!confirm(confirmText)) return;

    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch('/api/admin/newsletter/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, audience: audiencePayload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      if (!data.job_id) {
        setInfo(data.message || 'No recipients matched.');
        return;
      }

      setActiveJobId(data.job_id);
      setAudience(defaultAudienceValue());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setActiveJobId(null);
    setError(null);
    setInfo(null);
  }

  // Collapsed state — just the trigger button
  if (!expanded && !activeJobId) {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Re-send to subscribers</div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>{intro}</p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="btn btn-ghost"
            style={{ padding: '10px 16px', fontSize: 13 }}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    );
  }

  // Active job state — show the progress widget + reset
  if (activeJobId) {
    return (
      <div style={cardStyle}>
        <JobProgress jobId={activeJobId} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button
            type="button"
            onClick={reset}
            className="btn btn-ghost"
            style={{ padding: '8px 14px', fontSize: 12 }}
          >
            ← Send again to a different audience
          </button>
        </div>
      </div>
    );
  }

  // Expanded form state
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Re-send to subscribers</div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="btn btn-ghost"
          style={{ padding: '6px 12px', fontSize: 12 }}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>

      <AudiencePicker
        subscribers={subscribers}
        value={audience}
        onChange={setAudience}
        disabled={submitting}
        intro="Choose who receives this re-send. Defaults to all confirmed subscribers."
      />

      <div
        style={{
          background: 'rgba(196,255,61,0.04)',
          border: '1px solid rgba(196,255,61,0.25)',
          borderRadius: 12,
          padding: 20,
          marginTop: 16,
        }}
      >
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>
          {recipientCount === 0 ? (
            <span style={{ color: '#ff9b6b' }}>No recipients selected.</span>
          ) : (
            <>
              Will send <strong style={{ color: 'var(--neon)' }}>{postTitle}</strong> to{' '}
              <strong style={{ color: 'var(--neon)' }}>{recipientCount.toLocaleString()} subscriber{recipientCount === 1 ? '' : 's'}</strong>.
              A new entry is created in the Newsletter log; the original send is preserved.
              {recipientCount > 1000 && ' Large sends run in the background — you can leave this page.'}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={send}
          disabled={submitting || recipientCount === 0}
          className="btn btn-primary"
          style={{ padding: '10px 20px', fontSize: 13 }}
        >
          {submitting
            ? 'Starting…'
            : `Send to ${recipientCount.toLocaleString()} subscriber${recipientCount === 1 ? '' : 's'} →`}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 8,
            background: 'rgba(255,107,107,0.1)',
            border: '1px solid rgba(255,107,107,0.3)',
            color: '#ff9b6b',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {info && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 8,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--line)',
            color: 'var(--text-2)',
            fontSize: 12,
          }}
        >
          {info}
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
  marginBottom: 24,
};
