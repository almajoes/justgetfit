'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * <AnalyticsBeacon />
 *
 * Fires a pageview to /api/track on every page navigation. Mounted once at
 * the root layout so it persists across client-side route changes.
 *
 * How it knows when to fire:
 *   - Initial mount → fire once for the landing page
 *   - usePathname() change → fire for client-side navigation (Next.js Link)
 *   - searchParams changes → fire when query strings change (e.g. filter
 *     parameters on a listing page). Most analytics tools count these as
 *     separate pageviews, so we do too.
 *
 * Why navigator.sendBeacon():
 *   - Works even if the user closes the tab immediately after the page loads
 *     (queued by the browser as a low-priority background fetch)
 *   - Doesn't block the next navigation
 *   - Falls back to fetch with keepalive: true if sendBeacon unavailable
 *
 * Cookie-based identity:
 *   - Reads _jgf_vid cookie if it exists (set by us, lifetime 1 year)
 *   - Reads _jgf_consent cookie to know if user consented (set by CookieBanner)
 *   - If consent=true and no _jgf_vid yet, we generate a UUID and set it
 *   - If consent!=true, we don't set any cookie; server falls back to
 *     fingerprint-based hashing
 *   - _jgf_sid is a session cookie (no max-age) for grouping pageviews into
 *     sessions. Generated client-side and rotated after 30min idle.
 */

// Idle threshold for session rotation — 30 minutes
const SESSION_TTL_MS = 30 * 60 * 1000;

export function AnalyticsBeacon() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastFiredRef = useRef<string | null>(null);

  useEffect(() => {
    // Build a navigation key — fire only once per unique path+query combo per
    // mount cycle. Without this, React StrictMode in dev would double-fire.
    const navKey = `${pathname}?${searchParams?.toString() || ''}`;
    if (lastFiredRef.current === navKey) return;
    lastFiredRef.current = navKey;

    // Skip /admin paths entirely — owner traffic shouldn't pollute analytics
    if (pathname?.startsWith('/admin')) return;
    // Skip API paths just in case (shouldn't be reachable but defensive)
    if (pathname?.startsWith('/api')) return;

    // Read consent + visitor cookies
    const consented = readCookie('_jgf_consent') === 'true';
    let vid: string | null = null;
    if (consented) {
      vid = readCookie('_jgf_vid');
      if (!vid) {
        vid = generateUUID();
        // 1-year cookie
        writeCookie('_jgf_vid', vid, 365);
      }
    }

    // Session ID — read or rotate
    let sid = readCookie('_jgf_sid');
    const sidLastSeen = readCookie('_jgf_sid_t');
    const now = Date.now();
    const lastSeenMs = sidLastSeen ? parseInt(sidLastSeen, 10) : 0;
    if (!sid || now - lastSeenMs > SESSION_TTL_MS) {
      sid = generateUUID();
    }
    // Refresh session timestamp on every pageview (sliding window)
    writeCookie('_jgf_sid', sid, null); // session cookie
    writeCookie('_jgf_sid_t', String(now), null);

    const payload = {
      path: pathname,
      referrer: document.referrer || null,
      consented,
      vid: vid || null,
      sid,
    };

    const url = '/api/track';
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });

    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, blob);
    } else {
      // Fallback for very old browsers
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        // Silent failure — never block navigation for analytics
      });
    }
  }, [pathname, searchParams]);

  return null;
}

// ─── Cookie helpers ──────────────────────────────────────────────────────

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function writeCookie(name: string, value: string, maxAgeDays: number | null) {
  if (typeof document === 'undefined') return;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'path=/',
    'samesite=lax',
  ];
  if (maxAgeDays !== null) {
    parts.push(`max-age=${maxAgeDays * 24 * 60 * 60}`);
  }
  // Mark Secure if we're on HTTPS (always in production)
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    parts.push('secure');
  }
  document.cookie = parts.join('; ');
}

function generateUUID(): string {
  // crypto.randomUUID is widely available; fall back to manual UUID v4 if not.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
