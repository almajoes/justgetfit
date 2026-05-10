import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/sources/check-links
 *
 * Verify that a batch of URLs returns 200. Used by the Sources admin
 * page's "Check links" button.
 *
 * Body: { urls: string[] } (max 20 per request — caller chunks)
 *
 * Returns: { results: [{ url, ok, status, reason }] }
 *
 * Each URL is HEAD-fetched first (cheaper than full GET); if HEAD is
 * unsupported (some sites 405 on HEAD), we fall back to GET. 6s timeout
 * per URL. Runs in parallel within a request — caller controls overall
 * batch size to stay under the 60s function limit.
 *
 * NOT a full re-verification (we don't re-check title match here, just
 * status). For deeper verification, the user can re-run citations with
 * the force=1 flag on the post.
 */

const MAX_PER_REQUEST = 20;
const PER_URL_TIMEOUT_MS = 6000;

type CheckResult = {
  url: string;
  ok: boolean;
  status: number | null;
  reason: string | null;
};

export async function POST(req: NextRequest) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: { urls?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.urls) || body.urls.some((x) => typeof x !== 'string')) {
    return NextResponse.json({ error: 'Body must be { urls: string[] }' }, { status: 400 });
  }
  const urls = (body.urls as string[]).slice(0, MAX_PER_REQUEST);
  if (urls.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // Run all checks in parallel — independent network requests.
  const results = await Promise.all(urls.map((u) => checkOne(u)));
  return NextResponse.json({ results });
}

async function checkOne(url: string): Promise<CheckResult> {
  // Sanity-check the URL first — anything that doesn't even parse fails
  // immediately without a network round-trip.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { url, ok: false, status: null, reason: 'invalid URL' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { url, ok: false, status: null, reason: 'unsupported protocol' };
  }

  // HEAD first (cheaper — no body transfer). Fall back to GET if the
  // server returns 405 (Method Not Allowed) which some publications do.
  const tryFetch = async (method: 'HEAD' | 'GET') => {
    const ctl = new AbortController();
    const timeout = setTimeout(() => ctl.abort(), PER_URL_TIMEOUT_MS);
    try {
      return await fetch(parsed.toString(), {
        method,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; JustGetFitBot/1.0; +https://justgetfit.org)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: ctl.signal,
        redirect: 'follow',
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    let res = await tryFetch('HEAD');
    if (res.status === 405 || res.status === 403) {
      // Some sites block HEAD or return 403 on HEAD even for public URLs.
      // Retry as GET — body gets discarded, just want status.
      res = await tryFetch('GET');
    }
    return {
      url,
      ok: res.ok,
      status: res.status,
      reason: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch failed';
    return { url, ok: false, status: null, reason: msg };
  }
}
