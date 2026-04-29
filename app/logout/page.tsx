import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Logged out',
  robots: { index: false, follow: false },
};

/**
 * /logout
 *
 * HTTP Basic Auth has no real logout — the browser caches credentials and re-sends
 * them automatically. Two strategies used here:
 *
 *   1. The page itself lives outside the /admin route, so the admin sidebar is gone
 *      (visually clear that the user is no longer "in" the admin)
 *   2. A small client-side script attempts to make a fetch to /admin with bogus
 *      credentials, which causes some browsers to drop the cached good ones.
 *      Best-effort — closing the tab is the only 100% reliable way.
 */
export default function LogoutPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}
    >
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--neon)',
            marginBottom: 12,
          }}
        >
          Just Get Fit Admin
        </div>
        <h1
          style={{
            fontSize: 'clamp(32px, 5vw, 48px)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            margin: '0 0 16px',
          }}
        >
          Logged out
        </h1>
        <p
          style={{
            fontSize: 15,
            color: 'var(--text-2)',
            lineHeight: 1.6,
            margin: '0 0 32px',
          }}
        >
          For full sign-out, close this browser tab. Some browsers cache basic-auth
          credentials until the tab closes.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/" className="btn btn-primary">
            Go to homepage
          </Link>
          <Link href="/admin" className="btn btn-ghost">
            Log back in
          </Link>
        </div>
      </div>
      {/* Best-effort: try to invalidate cached basic-auth credentials.
          Sends a request with intentionally bad credentials — some browsers
          (Chrome/Edge) will drop the previously-cached good ones. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            try {
              var xhr = new XMLHttpRequest();
              xhr.open('GET', '/admin', true, 'logout', 'logout');
              xhr.send();
            } catch (e) {}
          `,
        }}
      />
    </main>
  );
}
