import { NextRequest, NextResponse } from 'next/server';
import { isBot, parseUA, extractReferrerDomain } from '@/lib/ua-parse';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/track
 *
 * Pageview beacon endpoint. Called by <AnalyticsBeacon> on every pageview.
 * Writes one row to public.pageviews and returns 204 No Content.
 *
 * Runtime: nodejs (NOT edge — we need crypto.subtle for the visitor hash AND
 * we need to use the Supabase service role key. Edge would be ~150ms faster
 * cold-start but introduces complexity around env var access. The beacon is
 * fire-and-forget from the client (sendBeacon) so latency here doesn't block
 * the user's page render.)
 *
 * Privacy guarantees:
 *   - Raw IP is NEVER stored. It's combined with UA + a daily date salt and
 *     hashed (sha256) into visitor_hash for non-consented users. The salt
 *     rotates every day at UTC midnight — so the same person produces
 *     different hashes day-to-day, preventing cross-day tracking without
 *     consent. (Day-of uniqueness still works for "unique visitors today".)
 *   - For consented users, the visitor_hash is just their cookie UUID.
 *   - Bots are tagged is_bot=true but their data is still stored (for audit /
 *     debugging). Dashboard filters them out by default.
 *
 * Failure modes:
 *   - All errors swallowed and logged. Beacon must NEVER throw a status code
 *     that makes the client retry — analytics failure should be silent.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// We construct the Supabase client inside the handler (lazy) so the route file
// can be imported without env vars present at build time. Service role key is
// required because we're inserting from a server route bypassing RLS.
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase env vars');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const OWN_DOMAIN = 'justgetfit.org';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Required field
    const path = typeof body.path === 'string' ? body.path.slice(0, 500) : null;
    if (!path) {
      // 204 even on bad input — never make the client retry
      return new NextResponse(null, { status: 204 });
    }

    // Headers — Vercel provides geo + IP via these headers automatically
    const userAgent = req.headers.get('user-agent') || '';
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    const country = req.headers.get('x-vercel-ip-country') || null;

    // Bot detection — early exit decision but still log
    const botFlag = isBot(userAgent);

    // Parse UA into device/browser/os
    const { device_type, browser, os } = parseUA(userAgent);

    // Referrer
    const referrerUrl = typeof body.referrer === 'string' ? body.referrer.slice(0, 1000) : null;
    const referrerDomain = extractReferrerDomain(referrerUrl, OWN_DOMAIN);

    // Visitor hash — hybrid strategy
    let visitorHash: string;
    const consented = body.consented === true;
    const cookieVid = typeof body.vid === 'string' ? body.vid.slice(0, 64) : null;

    if (consented && cookieVid) {
      // Consented users: use their cookie-stored UUID directly.
      visitorHash = `c:${cookieVid}`;
    } else {
      // Non-consented: hash IP + UA + today's date.
      // The date salt makes the hash rotate daily — can't track across days.
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const fingerprintInput = `${ip}|${userAgent}|${today}`;
      visitorHash = `f:${await sha256(fingerprintInput)}`;
    }

    // Session ID — client-generated, lives in session cookie
    const sessionId = typeof body.sid === 'string' ? body.sid.slice(0, 64) : null;

    // Insert. Don't throw on errors — log and 204.
    const supabase = getSupabase();
    const { error } = await supabase.from('pageviews').insert({
      path,
      referrer_url: referrerUrl,
      referrer_domain: referrerDomain,
      country,
      device_type,
      browser,
      os,
      visitor_hash: visitorHash,
      session_id: sessionId,
      is_bot: botFlag,
    });

    if (error) {
      console.error('[track] insert failed:', error.message);
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error('[track] unhandled error:', err);
    return new NextResponse(null, { status: 204 });
  }
}

/**
 * SHA-256 hex digest using the Web Crypto API (available in Node 20+).
 * Used for fingerprint-based visitor hashes.
 */
async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
