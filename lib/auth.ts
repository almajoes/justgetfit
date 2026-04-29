import 'server-only';
import { headers } from 'next/headers';

export function checkAdminAuth(): { ok: true } | { ok: false; response: Response } {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return {
      ok: false,
      response: new Response('Server misconfigured: ADMIN_PASSWORD not set', { status: 500 }),
    };
  }

  const auth = headers().get('authorization');
  if (auth?.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const [, password] = decoded.split(':');
    if (password === expected) return { ok: true };
  }

  return {
    ok: false,
    response: new Response('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Admin"' },
    }),
  };
}
