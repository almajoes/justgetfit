'use client';
import { useState } from 'react';

export function SubscribeForm({
  placeholder,
  buttonLabel,
  source,
}: {
  placeholder: string;
  buttonLabel: string;
  source: string;
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setMessage('');
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus('error');
        setMessage(json.error || 'Something went wrong.');
        return;
      }
      setStatus('sent');
      setMessage('Check your email — we sent a confirmation link.');
      setEmail('');
    } catch (err) {
      setStatus('error');
      setMessage('Network error — please try again.');
    }
  }

  return (
    <div style={{ maxWidth: 520, marginBottom: 56 }}>
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          gap: 8,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--line-2)',
          padding: 6,
          borderRadius: 100,
          flexWrap: 'wrap',
        }}
      >
        <input
          type="email"
          required
          placeholder={placeholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'submitting' || status === 'sent'}
          style={{
            flex: 1,
            minWidth: 220,
            background: 'transparent',
            border: 'none',
            color: 'var(--text)',
            padding: '12px 18px',
            fontSize: 14,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={status === 'submitting' || status === 'sent'} style={{ padding: '12px 28px' }}>
          {status === 'submitting' ? 'Sending…' : buttonLabel}
        </button>
      </form>
      {message && (
        <p style={{ marginTop: 12, fontSize: 14, color: status === 'error' ? '#ff6b6b' : 'var(--neon)' }}>
          {message}
        </p>
      )}
    </div>
  );
}
