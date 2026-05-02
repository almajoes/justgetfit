'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * <CookieBanner />
 *
 * Sticky banner at the bottom of the viewport asking for cookie consent.
 * Shows ONLY if the user hasn't made a choice yet (no _jgf_consent cookie
 * present). Once they click Accept or Decline, the cookie is set and the
 * banner never shows again until the cookie expires (1 year).
 *
 * Generic copy intentionally — we don't enumerate exactly what cookies do
 * (just say "improve your experience and analyze traffic"). Linking to
 * /privacy gives full disclosure for those who want it.
 *
 * Behavior:
 *   - Accept → _jgf_consent=true, _jgf_vid generated next pageview, full
 *     analytics tracking with persistent visitor ID
 *   - Decline → _jgf_consent=false, fingerprint-based identity only (rotates
 *     daily; can't track across days). Site otherwise works exactly the same.
 *
 * The banner is intentionally simple — no "manage preferences", no
 * fine-grained category toggles. JustGetFit only sets one analytics cookie;
 * the user's choice is binary.
 */
export function CookieBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  // Never show the banner on admin paths. Admin is owner-only and there's no
  // reason to interrupt admin work with a consent prompt. This check runs on
  // every render so even if the user navigates from /admin → /admin/inbox the
  // banner stays hidden the whole time.
  const isAdmin = pathname?.startsWith('/admin') ?? false;

  useEffect(() => {
    if (isAdmin) {
      setVisible(false);
      return;
    }
    // Show the banner only if no choice has been made yet
    const consent = readCookie('_jgf_consent');
    if (consent === null) {
      // Slight delay so the banner doesn't flash on page load
      const t = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(t);
    }
  }, [isAdmin]);

  function handleAccept() {
    writeCookie('_jgf_consent', 'true', 365);
    setVisible(false);
    // The next pageview beacon will pick up the new consent value and create
    // the persistent _jgf_vid cookie. No need to fire one immediately.
  }

  function handleDecline() {
    writeCookie('_jgf_consent', 'false', 365);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 720,
        margin: '0 auto',
        background: 'var(--bg-1, #1a1a1a)',
        color: 'var(--text, #e8e8e8)',
        border: '1px solid var(--line, #2a2a2a)',
        borderRadius: 12,
        padding: '16px 20px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <div>
        We use cookies to improve your experience and analyze traffic.{' '}
        <Link href="/privacy" style={{ color: 'var(--neon, #c4ff3d)', textDecoration: 'underline' }}>
          Learn more
        </Link>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={handleAccept}
          style={{
            background: 'var(--neon, #c4ff3d)',
            color: 'var(--bg-0, #0a0a0a)',
            border: 'none',
            borderRadius: 100,
            padding: '8px 18px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Accept
        </button>
        <button
          onClick={handleDecline}
          style={{
            background: 'transparent',
            color: 'var(--text-2, #aaa)',
            border: '1px solid var(--line, #2a2a2a)',
            borderRadius: 100,
            padding: '8px 18px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}

// ─── Cookie helpers (duplicated from AnalyticsBeacon — both are client-side
// only and small enough that an extra import isn't worth it) ──────────────

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function writeCookie(name: string, value: string, maxAgeDays: number) {
  if (typeof document === 'undefined') return;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'path=/',
    'samesite=lax',
    `max-age=${maxAgeDays * 24 * 60 * 60}`,
  ];
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    parts.push('secure');
  }
  document.cookie = parts.join('; ');
}
