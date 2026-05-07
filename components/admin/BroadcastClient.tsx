'use client';

import { useState, useMemo } from 'react';
import { JobProgress } from './JobProgress';
import {
  AudiencePicker,
  resolveAudience,
  defaultAudienceValue,
  type AudienceValue,
  type Subscriber,
} from './AudiencePicker';

export function BroadcastClient({ subscribers }: { subscribers: Subscriber[] }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState<'none' | 'broadcast'>('none');
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  // When a broadcast is enqueued, server returns a job_id. We render <JobProgress />
  // for live updates and lock the form. User can click "Compose another" to reset.
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Audience selection lives in a single state object so we can pass it to the
  // shared <AudiencePicker /> as a controlled prop.
  const [audience, setAudience] = useState<AudienceValue>(() => defaultAudienceValue());

  const resolved = useMemo(() => resolveAudience(subscribers, audience), [subscribers, audience]);
  const recipients = resolved.recipients;
  const recipientCount = resolved.recipientCount;

  const charCount = body.length;
  const subjectCharCount = subject.length;
  const canSend = subject.trim().length > 0 && body.trim().length > 0 && sending === 'none';

  // ─── Real broadcast ──────────────────────────────────────────────────
  async function sendBroadcast() {
    if (recipientCount === 0) {
      setMessage({ kind: 'error', text: 'No recipients selected — pick at least one subscriber.' });
      return;
    }
    const confirmText =
      audience.mode === 'all'
        ? `Send this broadcast to all ${recipientCount.toLocaleString()} confirmed subscriber${recipientCount === 1 ? '' : 's'}?`
        : `Send this broadcast to ${recipientCount.toLocaleString()} selected subscriber${recipientCount === 1 ? '' : 's'}?`;
    if (!confirm(`${confirmText}\n\nSubject: ${subject}\n\nThis cannot be undone.`)) return;

    setSending('broadcast');
    setMessage(null);
    try {
      // Server expects either { mode: 'all' } OR an explicit subscriber_ids list.
      // For non-'all' modes we resolve to ids client-side and send those.
      const payload: {
        subject: string;
        body_markdown: string;
        mode: 'all' | 'list';
        subscriber_ids?: string[];
      } =
        audience.mode === 'all'
          ? { subject, body_markdown: body, mode: 'all' }
          : {
              subject,
              body_markdown: body,
              mode: 'list',
              subscriber_ids: recipients.map((r) => r.id),
            };

      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      // Server returns { job_id, send_id, total_recipients } when a job was enqueued.
      // If no job_id (zero eligible recipients), surface that as info.
      if (!data.job_id) {
        setMessage({ kind: 'info', text: data.message || 'Broadcast accepted but no recipients matched.' });
        return;
      }

      // Switch into "watch the job" mode.
      setActiveJobId(data.job_id);
      setMessage({
        kind: 'success',
        text: `Send started for ${data.total_recipients.toLocaleString()} subscriber${data.total_recipients === 1 ? '' : 's'}. Progress shown below.`,
      });
      setSubject('');
      setBody('');
      setAudience(defaultAudienceValue());
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Broadcast failed' });
    } finally {
      setSending('none');
    }
  }

  function composeAnother() {
    setActiveJobId(null);
    setMessage(null);
  }

  const formDisabled = sending !== 'none' || activeJobId !== null;

  return (
    <div className="admin-page-pad" style={{ padding: 32, maxWidth: 920, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>Broadcast</h1>
      <p style={{ color: 'var(--text-2)', marginBottom: 32, lineHeight: 1.6 }}>
        Send an off-cycle email to a chosen set of subscribers. Use this for announcements, schedule changes,
        or anything outside the standard Monday article.
      </p>

      {/* Active job: show progress at the top + offer reset */}
      {activeJobId && (
        <>
          <JobProgress jobId={activeJobId} />
          <div style={{ marginBottom: 32 }}>
            <button type="button" onClick={composeAnother} className="btn btn-ghost" style={{ padding: '10px 16px', fontSize: 13 }}>
              ← Compose another broadcast
            </button>
            <p style={{ ...muted, marginTop: 8 }}>
              You can leave this page — the send continues in the background. Check the Newsletter log for final tallies.
            </p>
          </div>
        </>
      )}

      {/* SUBJECT + BODY */}
      <div style={card}>
        <div style={{ marginBottom: 20 }}>
          <label className="label">Subject line</label>
          <input
            type="text"
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={formDisabled}
            placeholder="A short, punchy subject"
            style={{ width: '100%' }}
          />
          <p style={muted}>
            <span style={{ color: subjectCharCount > 200 ? '#ff6b6b' : 'var(--text-3)' }}>
              {subjectCharCount}
            </span>{' '}
            / 200 characters
          </p>
        </div>

        <div>
          <label className="label">Body (Markdown)</label>
          <textarea
            className="input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={formDisabled}
            placeholder="Write the email content. Markdown supported."
            rows={14}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6, resize: 'vertical' }}
          />
          <p style={muted}>
            {charCount} characters · Supports <code style={inlineCode}>**bold**</code>,{' '}
            <code style={inlineCode}>*italic*</code>, <code style={inlineCode}>[link](url)</code>,{' '}
            <code style={inlineCode}>## heading</code>, <code style={inlineCode}>- list</code>,{' '}
            <code style={inlineCode}>&gt; quote</code>. The unsubscribe link is appended automatically.
          </p>
        </div>
      </div>

      {/* SHARED AUDIENCE PICKER */}
      <AudiencePicker
        subscribers={subscribers}
        value={audience}
        onChange={setAudience}
        disabled={formDisabled}
        intro="Choose who receives this broadcast. Default is everyone confirmed."
      />

      {/* FULL BLAST */}
      <div
        style={{
          background: 'rgba(196,255,61,0.04)',
          border: '1px solid rgba(196,255,61,0.25)',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Send broadcast</div>
        <p style={{ ...muted, marginBottom: 16 }}>
          {recipientCount === 0 ? (
            <span style={{ color: '#ff9b6b' }}>
              No recipients selected — choose &ldquo;All confirmed&rdquo; or pick at least one subscriber/group.
            </span>
          ) : (
            <>
              Will send to{' '}
              <strong style={{ color: 'var(--neon)' }}>
                {recipientCount.toLocaleString()} subscriber{recipientCount === 1 ? '' : 's'}
              </strong>
              . Each gets a unique unsubscribe link. The send is logged in the Newsletter log with open/click tracking.
              {recipientCount > 1000 && ' Large sends are processed in the background — you can leave this page open to watch progress.'}
            </>
          )}
        </p>
        <button
          onClick={sendBroadcast}
          disabled={!canSend || recipientCount === 0 || sending !== 'none' || activeJobId !== null}
          className="btn btn-primary"
          style={{ padding: '12px 24px', fontSize: 14 }}
        >
          {sending === 'broadcast'
            ? `Starting send to ${recipientCount.toLocaleString()}…`
            : `Send to ${recipientCount.toLocaleString()} subscriber${recipientCount === 1 ? '' : 's'} →`}
        </button>
      </div>

      {/* MESSAGE BANNER */}
      {message && (
        <div
          style={{
            padding: 14,
            borderRadius: 8,
            background:
              message.kind === 'success'
                ? 'rgba(196,255,61,0.08)'
                : message.kind === 'error'
                ? 'rgba(255,107,107,0.1)'
                : 'rgba(255,255,255,0.04)',
            border:
              message.kind === 'success'
                ? '1px solid rgba(196,255,61,0.3)'
                : message.kind === 'error'
                ? '1px solid rgba(255,107,107,0.3)'
                : '1px solid var(--line)',
            color: message.kind === 'success' ? 'var(--neon)' : message.kind === 'error' ? '#ff9b6b' : 'var(--text-2)',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  background: 'var(--bg-1)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: 24,
  marginBottom: 24,
};

const muted: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-3)',
  marginTop: 6,
  lineHeight: 1.5,
};

const inlineCode: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  padding: '1px 5px',
  borderRadius: 4,
  fontSize: 11,
  fontFamily: 'monospace',
};
