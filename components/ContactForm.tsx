'use client';
import { useEffect, useState } from 'react';

type Props = {
  labels: { name: string; email: string; subject: string; message: string; submit: string };
  placeholders: { name: string; email: string; subject: string; message: string };
  successMessage: string;
};

/**
 * Contact form with two layers of spam protection:
 *
 *   1. reCAPTCHA v3 (invisible). Loads the Google script when this component
 *      mounts, calls grecaptcha.execute() on submit to get a token. Token is
 *      sent to /api/contact which verifies it server-side against Google's
 *      siteverify endpoint. Submissions with score < 0.5 are rejected as bots.
 *
 *      Site key is read from NEXT_PUBLIC_RECAPTCHA_SITE_KEY. If not configured
 *      (e.g., local development without setup), the captcha is silently skipped
 *      and the form still works — the server route only enforces verification
 *      when the env var is set on its side too.
 *
 *   2. Honeypot field. A hidden 'website' input that real users never see and
 *      never fill. Naive spam bots fill every field they find — the server
 *      rejects any submission with a non-empty honeypot. Costs ~0 bytes,
 *      catches the laziest scrapers that skip captcha entirely.
 */

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

export function ContactForm({ labels, placeholders, successMessage }: Props) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Inject the reCAPTCHA v3 script once on mount, only if a site key is configured.
  // We deliberately scope this to the contact form (not site-wide) so we don't
  // ping Google's servers from every page-view — better for privacy + performance.
  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY) return;
    const existing = document.querySelector('script[data-recaptcha]');
    if (!existing) {
      const s = document.createElement('script');
      s.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
      s.async = true;
      s.defer = true;
      s.dataset.recaptcha = 'true';
      document.head.appendChild(s);
    }

    // Cleanup on unmount: remove the floating badge that Google injects into
    // <body>. Without this, the badge persists across client-side navigations
    // even after leaving /contact (since SPA navigation doesn't reload the
    // page or re-run scripts). The badge sticks in the corner of every other
    // page until a hard refresh.
    //
    // We leave the script tag and window.grecaptcha alone — those have no
    // visual presence and re-using them on a return visit to /contact is
    // faster than re-loading.
    return () => {
      const badges = document.querySelectorAll('.grecaptcha-badge');
      badges.forEach((b) => {
        // The badge is wrapped in a positioned container; remove that too
        const wrapper = b.parentElement;
        if (wrapper && wrapper !== document.body) {
          wrapper.remove();
        } else {
          b.remove();
        }
      });
    };
  }, []);

  async function getRecaptchaToken(): Promise<string | null> {
    if (!RECAPTCHA_SITE_KEY) return null;
    if (!window.grecaptcha) {
      // Script hasn't finished loading. In practice on a slow connection this
      // could happen if the user submits within a couple seconds of page load.
      // Wait briefly, then fail open (server still rejects if env requires it).
      await new Promise((r) => setTimeout(r, 1500));
      if (!window.grecaptcha) return null;
    }
    return new Promise((resolve) => {
      window.grecaptcha!.ready(async () => {
        try {
          const token = await window.grecaptcha!.execute(RECAPTCHA_SITE_KEY!, { action: 'contact' });
          resolve(token);
        } catch {
          resolve(null);
        }
      });
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');

    const fd = new FormData(e.currentTarget);
    const recaptchaToken = await getRecaptchaToken();

    const payload = {
      name: fd.get('name'),
      email: fd.get('email'),
      subject: fd.get('subject'),
      message: fd.get('message'),
      // Honeypot — must be empty for a real human submission. Bots that auto-fill
      // every form field will fail this check at the server.
      website: fd.get('website'),
      recaptchaToken,
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="admin-grid-2">
        <div>
          <label className="label" htmlFor="name">{labels.name}</label>
          <input id="name" name="name" className="input" required placeholder={placeholders.name} autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="email">{labels.email}</label>
          <input id="email" name="email" type="email" className="input" required placeholder={placeholders.email} autoComplete="email" />
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

      {/* Honeypot — visually hidden but technically present. Real humans won't
          fill it (it's offscreen + tab-unreachable + clearly labeled "leave blank"
          for screen readers). Bots auto-filling every input will trip it. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '-10000px',
          top: 'auto',
          width: 1,
          height: 1,
          overflow: 'hidden',
        }}
      >
        <label htmlFor="website">Leave this blank</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      {errorMsg && <p style={{ fontSize: 14, color: '#ff6b6b' }}>{errorMsg}</p>}
      <button type="submit" className="btn btn-primary" disabled={status === 'submitting'} style={{ alignSelf: 'flex-start' }}>
        {status === 'submitting' ? 'Sending…' : labels.submit}
      </button>

      {/* reCAPTCHA badge attribution required by Google's TOS when using v3.
          Google's docs say you can hide the floating badge in the corner if you
          include this attribution somewhere on the form. */}
      {RECAPTCHA_SITE_KEY && (
        <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, marginTop: 4 }}>
          This site is protected by reCAPTCHA and the Google{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer noopener" style={{ color: 'var(--text-3)' }}>
            Privacy Policy
          </a>{' '}
          and{' '}
          <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer noopener" style={{ color: 'var(--text-3)' }}>
            Terms of Service
          </a>{' '}
          apply.
        </p>
      )}
    </form>
  );
}
