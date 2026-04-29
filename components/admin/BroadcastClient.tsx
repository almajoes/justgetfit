'use client';

import { useState } from 'react';

export function BroadcastClient({ confirmedCount }: { confirmedCount: number }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState<'none' | 'test' | 'broadcast'>('none');
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);

  const charCount = body.length;
  const subjectCharCount = subject.length;
  const canSend = subject.trim().length > 0 && body.trim().length > 0 && sending === 'none';

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
    if (confirmedCount === 0) {
      setMessage({ kind: 'error', text: 'No confirmed subscribers — nothing to send.' });
      return;
    }
    if (
      !confirm(
        `Send this broadcast to all ${confirmedCount} confirmed subscriber${confirmedCount === 1 ? '' : 's'}?\n\nSubject: ${subject}\n\nThis cannot be undone.`
      )
    ) {
      return;
    }
    setSending('broadcast');
    setMessage(null);
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body_markdown: body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMessage({
        kind: 'success',
        text: `Broadcast sent to ${data.recipient_count} subscriber${data.recipient_count === 1 ? '' : 's'}. ${data.failed_count} failed.`,
      });
      // Clear the form after success
      setSubject('');
      setBody('');
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Broadcast failed' });
    } finally {
      setSending('none');
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 880, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>Broadcast</h1>
      <p style={{ color: 'var(--text-2)', marginBottom: 32, lineHeight: 1.6 }}>
        Send an off-cycle email to all confirmed subscribers. Use this for announcements, schedule changes, or anything outside the standard Monday article. <strong style={{ color: 'var(--neon)' }}>{confirmedCount} confirmed subscriber{confirmedCount === 1 ? '' : 's'}</strong> will receive this.
      </p>

      <div
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
        }}
      >
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
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
            {subjectCharCount}/200 characters. Keep it under 60 for best mobile preview.
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label className="label">Body (Markdown supported)</label>
          <textarea
            className="input"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={sending !== 'none'}
            rows={14}
            style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6 }}
            placeholder={`Hey,

A quick update — we're launching a new category next week...

## What's changing

Some details here.

- Bullet point
- Another bullet point

Thanks for reading.`}
          />
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
            {charCount} characters · Supports <code style={inlineCode}>**bold**</code>, <code style={inlineCode}>*italic*</code>, <code style={inlineCode}>[link](url)</code>, <code style={inlineCode}>## heading</code>, <code style={inlineCode}>- list</code>, <code style={inlineCode}>{'>'} quote</code>. The unsubscribe link is appended automatically.
          </p>
        </div>
      </div>

      {/* TEST SEND CARD */}
      <div
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Send a test first</div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.6 }}>
          Send the email to yourself before blasting to subscribers. The subject line gets prefixed with <code style={inlineCode}>[TEST]</code> in the test send.
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
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          Send to all confirmed subscribers
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
          This sends to <strong>{confirmedCount} subscriber{confirmedCount === 1 ? '' : 's'}</strong>. Each gets a unique unsubscribe link. The send is logged in the Newsletter log.
        </p>
        <button
          onClick={sendBroadcast}
          disabled={!canSend || confirmedCount === 0 || sending !== 'none'}
          className="btn btn-primary"
          style={{ padding: '12px 24px', fontSize: 14 }}
        >
          {sending === 'broadcast'
            ? `Sending to ${confirmedCount}…`
            : `Send to ${confirmedCount} subscriber${confirmedCount === 1 ? '' : 's'} →`}
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

const inlineCode: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  padding: '1px 5px',
  borderRadius: 4,
  fontSize: 11,
};
