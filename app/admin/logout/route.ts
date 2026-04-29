import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /admin/logout
 *
 * HTTP Basic Auth has no native logout — the browser caches the credentials and
 * re-sends them automatically. To force a logout, we return 401 with a DIFFERENT
 * realm than the one set in middleware.ts. Most browsers (Chrome, Edge, Firefox)
 * see the new realm and drop the cached credentials.
 *
 * After logout, accessing /admin again pops the basic-auth dialog fresh.
 *
 * Note: This is HTTP basic auth's best-effort logout. Some browsers (especially
 * older Safari) may keep credentials cached until the browser is closed.
 * For bulletproof logout, swap to a real auth system (Supabase Auth or NextAuth).
 */
export function GET(_req: NextRequest) {
  // Detect if the user just clicked logout vs. arrived without credentials
  const url = new URL(_req.url);
  const confirmed = url.searchParams.get('confirmed') === '1';

  if (confirmed) {
    // After logout-flush, redirect cleanly to the homepage
    return NextResponse.redirect(new URL('/', _req.url));
  }

  // Return 401 with a different realm than middleware uses, which forces browsers
  // to discard the cached credentials for /admin/*
  return new NextResponse('Logged out. Redirecting…', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Logged out — please close this tab"',
      // Some browsers honor Clear-Site-Data to drop auth state more aggressively
      'Clear-Site-Data': '"cookies", "storage"',
      Refresh: '0; url=/admin/logout?confirmed=1',
    },
  });
}
