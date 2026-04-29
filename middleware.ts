import { NextRequest, NextResponse } from 'next/server';

/**
 * Protect /admin routes with HTTP Basic Auth.
 *
 * Runs on every request matching the matcher below (admin pages + admin APIs).
 * Compares the password from the Authorization header against ADMIN_PASSWORD.
 * Returns 401 with WWW-Authenticate to trigger the browser's basic-auth prompt.
 */
export function middleware(req: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD;

  // If no password is set in env, refuse access (safer than allowing through)
  if (!expected) {
    return new NextResponse('Server misconfigured: ADMIN_PASSWORD not set', { status: 500 });
  }

  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
      const colonIdx = decoded.indexOf(':');
      const password = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : '';
      if (password === expected) {
        return NextResponse.next();
      }
    } catch {
      // fall through to 401
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Admin"',
    },
  });
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
