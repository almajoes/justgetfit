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
      <form onSubmit={handleSubmit} className="news-form">
        <input
          type="email"
          required
          placeholder={placeholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'submitting' || status === 'sent'}
        />
        <button
          type="submit"
          disabled={status === 'submitting' || status === 'sent'}
        >
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
