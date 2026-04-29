'use client';
import { useState } from 'react';

type Props = {
  labels: { name: string; email: string; subject: string; message: string; submit: string };
  placeholders: { name: string; email: string; subject: string; message: string };
  successMessage: string;
};

export function ContactForm({ labels, placeholders, successMessage }: Props) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');

    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get('name'),
      email: fd.get('email'),
      subject: fd.get('subject'),
      message: fd.get('message'),
    };

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setStatus('error');
        setErrorMsg(json.error || 'Something went wrong.');
        return;
      }
      setStatus('sent');
      (e.target as HTMLFormElement).reset();
    } catch {
      setStatus('error');
      setErrorMsg('Network error — please try again.');
    }
  }

  if (status === 'sent') {
    return (
      <div
        style={{
          padding: 32,
          background: 'rgba(196,255,61,0.07)',
          border: '1px solid rgba(196,255,61,0.25)',
          borderRadius: 16,
          color: 'var(--text)',
        }}
      >
        {successMessage}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label className="label" htmlFor="name">{labels.name}</label>
          <input id="name" name="name" className="input" required placeholder={placeholders.name} />
        </div>
        <div>
          <label className="label" htmlFor="email">{labels.email}</label>
          <input id="email" name="email" type="email" className="input" required placeholder={placeholders.email} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="subject">{labels.subject}</label>
        <input id="subject" name="subject" className="input" placeholder={placeholders.subject} />
      </div>
      <div>
        <label className="label" htmlFor="message">{labels.message}</label>
        <textarea id="message" name="message" className="input" required rows={6} placeholder={placeholders.message} />
      </div>
      {errorMsg && <p style={{ fontSize: 14, color: '#ff6b6b' }}>{errorMsg}</p>}
      <button type="submit" className="btn btn-primary" disabled={status === 'submitting'} style={{ alignSelf: 'flex-start' }}>
        {status === 'submitting' ? 'Sending…' : labels.submit}
      </button>
    </form>
  );
}
