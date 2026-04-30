'use client';

import { useState, useMemo } from 'react';

type Subscriber = {
  id: string;
  email: string;
  source: string | null;
  subscribed_at: string;
};

type Mode = 'all' | 'source' | 'pick';

export function BroadcastClient({ subscribers }: { subscribers: Subscriber[] }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState<'none' | 'test' | 'broadcast'>('none');
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Audience selection
  const [mode, setMode] = useState<Mode>('all');
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pickerSearch, setPickerSearch] = useState('');

  const charCount = body.length;
  const subjectCharCount = subject.length;

  // Distinct sources, with counts. "(none)" is its own bucket for subs with no source set.
  const sources = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of subscribers) {
      const k = s.source || '(none)';
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]); // most-common first
  }, [subscribers]);

  // Compute the actual recipient list based on the mode.
  const recipients = useMemo(() => {
    if (mode === 'all') return subscribers;
    if (mode === 'source') {
      if (selectedSources.size === 0) return [];
      return subscribers.filter((s) => selectedSources.has(s.source || '(none)'));
    }
    // mode === 'pick'
    return subscribers.filter((s) => selectedIds.has(s.id));
  }, [mode, subscribers, selectedSources, selectedIds]);

  const recipientCount = recipients.length;
  const canSend = subject.trim().length > 0 && body.trim().length > 0 && sending === 'none';

  // For the picker, filter by search
  const visiblePickerSubs = useMemo(() => {
    if (!pickerSearch.trim()) return subscribers;
    const q = pickerSearch.toLowerCase();
    return subscribers.filter(
      (s) => s.email.toLowerCase().includes(q) || (s.source || '').toLowerCase().includes(q)
    );
  }, [subscribers, pickerSearch]);

  function toggleSource(src: string) {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  }

  function togglePicked(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      visiblePickerSubs.forEach((s) => next.add(s.id));
      return next;
    });
  }

  function deselectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      visiblePickerSubs.forEach((s) => next.delete(s.id));
      return next;
    });
  }

  async function sendTest() {
    if (!testEmail.trim()) {
      setMessage({ kind: 'error', text: 'Enter a test email address.' });
      return;
    }
    setSending('test');
    setMessage(null);
    try {
      const res = await fetch('/api/admin/broadcast/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body_markdown: body, to_email: testEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMessage({
        kind: 'success',
        text: `Test sent to ${testEmail}. Check inbox (and spam folder) — subject is prefixed with "[TEST]".`,
      });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Test send failed' });
    } finally {
      setSending('none');
    }
  }

  async function sendBroadcast() {
    if (recipientCount === 0) {
      setMessage({ kind: 'error', text: 'No recipients selected — pick at least one subscriber.' });
      return;
    }
    const confirmText =
      mode === 'all'
        ? `Send this broadcast to all ${recipientCount} confirmed subscriber${recipientCount === 1 ? '' : 's'}?`
        : `Send this broadcast to ${recipientCount} selected subscriber${recipientCount === 1 ? '' : 's'}?`;
    if (!confirm(`${confirmText}\n\nSubject: ${subject}\n\nThis cannot be undone.`)) return;

    setSending('broadcast');
    setMessage(null);
    try {
      // Server expects either { mode: 'all' } OR an explicit subscriber_ids list.
      // For 'source' mode we resolve to ids client-side and send those.
      const payload: {
        subject: string;
        body_markdown: string;
        mode: 'all' | 'list';
        subscriber_ids?: string[];
      } =
        mode === 'all'
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
      setMessage({
        kind: 'success',
        text: `Broadcast sent to ${data.recipient_count} subscriber${data.recipient_count === 1 ? '' : 's'}. ${data.failed_count} failed.`,
      });
      setSubject('');
      setBody('');
      setMode('all');
      setSelectedSources(new Set());
      setSelectedIds(new Set());
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Broadcast failed' });
    } finally {
      setSending('none');
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 920, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>Broadcast</h1>
      <p style={{ color: 'var(--text-2)', marginBottom: 32, lineHeight: 1.6 }}>
        Send an off-cycle email to a chosen set of subscribers. Use this for announcements, schedule changes,
        or anything outside the standard Monday article.
      </p>

      {/* SUBJECT + BODY */}
      <div style={card}>
        <div style={{ marginBottom: 20 }}>
          <label className="label">Subject line</label>
          <input
            type="text"
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={sending !== 'none'}
            placeholder="A short, punchy subject"
            maxLength={200}
          />
          <p style={muted}>{subjectCharCount}/200 characters. Keep it under 60 for best mobile preview.</p>
        </div>

        <div>
          <label className="label">Body (Markdown supported)</label>
          <textarea
            className="input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={sending !== 'none'}
            rows={14}
            style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6 }}
            placeholder={`Hey,\n\nA quick update — we're launching a new category next week...\n\n## What's changing\n\nSome details here.\n\n- Bullet point\n- Another bullet point\n\nThanks for reading.`}
          />
          <p style={muted}>
            {charCount} characters · Supports <code style={inlineCode}>**bold**</code>,{' '}
            <code style={inlineCode}>*italic*</code>, <code style={inlineCode}>[link](url)</code>,{' '}
            <code style={inlineCode}>## heading</code>, <code style={inlineCode}>- list</code>,{' '}
            <code style={inlineCode}>{'>'} quote</code>. The unsubscribe link is appended automatically.
          </p>
        </div>
      </div>

      {/* AUDIENCE PICKER */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Audience</div>
        <p style={{ ...muted, marginBottom: 16 }}>
          Choose who receives this broadcast. Default is everyone confirmed.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <ModeBtn active={mode === 'all'} onClick={() => setMode('all')}>
            All confirmed ({subscribers.length})
          </ModeBtn>
          <ModeBtn active={mode === 'source'} onClick={() => setMode('source')}>
            By source
          </ModeBtn>
          <ModeBtn active={mode === 'pick'} onClick={() => setMode('pick')}>
            Pick individuals
          </ModeBtn>
        </div>

        {mode === 'source' && (
          <div>
            <p style={muted}>
              Subscribers are tagged with a &ldquo;source&rdquo; when they sign up (e.g. <code style={inlineCode}>homepage</code>,{' '}
              <code style={inlineCode}>import-2026-04</code>). Pick one or more sources to include.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 8,
                marginTop: 12,
              }}
            >
              {sources.map(([src, count]) => {
                const checked = selectedSources.has(src);
                return (
                  <label
                    key={src}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1px solid ${checked ? 'var(--neon)' : 'var(--line)'}`,
                      background: checked ? 'rgba(196,255,61,0.06)' : 'transparent',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSource(src)}
                      style={{ accentColor: 'var(--neon)' }}
                    />
                    <span style={{ flex: 1, fontFamily: 'monospace' }}>{src}</span>
                    <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{count}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {mode === 'pick' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <input
                type="search"
                placeholder="Search by email or source…"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="input"
                style={{ flex: 1, minWidth: 240 }}
              />
              <button onClick={selectAllVisible} className="btn btn-ghost" style={smallBtn}>
                Select all visible
              </button>
              <button onClick={deselectAllVisible} className="btn btn-ghost" style={smallBtn}>
                Deselect all visible
              </button>
            </div>
            <div
              style={{
                maxHeight: 360,
                overflowY: 'auto',
                border: '1px solid var(--line)',
                borderRadius: 8,
                background: 'var(--bg-0)',
              }}
            >
              {visiblePickerSubs.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  No subscribers match.
                </div>
              ) : (
                visiblePickerSubs.map((s, i) => {
                  const checked = selectedIds.has(s.id);
                  return (
                    <label
                      key={s.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                        cursor: 'pointer',
                        fontSize: 13,
                        background: checked ? 'rgba(196,255,61,0.05)' : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePicked(s.id)}
                        style={{ accentColor: 'var(--neon)' }}
                      />
                      <span style={{ flex: 1, fontFamily: 'monospace' }}>{s.email}</span>
                      {s.source && (
                        <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{s.source}</span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* TEST SEND */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Send a test first</div>
        <p style={{ ...muted, marginBottom: 12 }}>
          Send the email to yourself before blasting to subscribers. Subject is prefixed with{' '}
          <code style={inlineCode}>[TEST]</code>.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="email"
            className="input"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            disabled={sending !== 'none'}
            placeholder="you@example.com"
            style={{ flex: 1, minWidth: 240 }}
          />
          <button
            onClick={sendTest}
            disabled={!canSend || !testEmail.trim() || sending !== 'none'}
            className="btn btn-ghost"
            style={{ padding: '12px 20px', fontSize: 13 }}
          >
            {sending === 'test' ? 'Sending test…' : 'Send test'}
          </button>
        </div>
      </div>

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
              No recipients selected — choose &ldquo;All confirmed&rdquo; or pick at least one subscriber/source.
            </span>
          ) : (
            <>
              Will send to{' '}
              <strong style={{ color: 'var(--neon)' }}>
                {recipientCount} subscriber{recipientCount === 1 ? '' : 's'}
              </strong>
              . Each gets a unique unsubscribe link. The send is logged in the Newsletter log with open/click
              tracking.
            </>
          )}
        </p>
        <button
          onClick={sendBroadcast}
          disabled={!canSend || recipientCount === 0 || sending !== 'none'}
          className="btn btn-primary"
          style={{ padding: '12px 24px', fontSize: 14 }}
        >
          {sending === 'broadcast'
            ? `Sending to ${recipientCount}…`
            : `Send to ${recipientCount} subscriber${recipientCount === 1 ? '' : 's'} →`}
        </button>
      </div>

      {message && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            fontSize: 14,
            lineHeight: 1.5,
            marginBottom: 24,
            background:
              message.kind === 'success'
                ? 'rgba(196,255,61,0.07)'
                : message.kind === 'error'
                ? 'rgba(255,107,107,0.1)'
                : 'rgba(255,255,255,0.04)',
            border: `1px solid ${
              message.kind === 'success'
                ? 'rgba(196,255,61,0.3)'
                : message.kind === 'error'
                ? '#ff6b6b'
                : 'var(--line-2)'
            }`,
            color:
              message.kind === 'success'
                ? 'var(--neon)'
                : message.kind === 'error'
                ? '#ff6b6b'
                : 'var(--text)',
          }}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 600,
        border: `1px solid ${active ? 'var(--neon)' : 'var(--line-2)'}`,
        background: active ? 'var(--neon)' : 'transparent',
        color: active ? '#000' : 'var(--text-2)',
        borderRadius: 8,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
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

const smallBtn: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 12,
};
