import Link from 'next/link';
import { AdminBottomTabs } from '@/components/admin/AdminBottomTabs';
import { getAdminCounts } from '@/lib/admin-counts';

// ─── Aggressive cache-busting ──────────────────────────────────────────
// The layout renders counter badges that must reflect real-time database
// state. Without these directives Next.js will cache the layout HTML across
// requests and counters will be stale (or worse, frozen at deploy time).
// This is the same pattern used in /admin/inbox — required for any admin
// surface that displays mutable data.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

const SECTIONS: { heading: string; links: { href: string; label: string; icon: string; countKey?: 'drafts' | 'topics' | 'subscribers' | 'inbox' }[] }[] = [
  {
    heading: 'Insights',
    links: [
      { href: '/admin/analytics', label: 'Analytics', icon: '📊' },
    ],
  },
  {
    heading: 'Content',
    links: [
      { href: '/admin/drafts', label: 'Drafts', icon: '📝', countKey: 'drafts' },
      { href: '/admin/posts', label: 'Posts', icon: '📰' },
      { href: '/admin/topics', label: 'Topic queue', icon: '💡', countKey: 'topics' },
      { href: '/admin/generate', label: 'Generate articles', icon: '✨' },
    ],
  },
  {
    heading: 'Newsletter',
    links: [
      { href: '/admin/subscribers', label: 'Subscribers', icon: '👥', countKey: 'subscribers' },
      { href: '/admin/broadcast', label: 'Broadcast', icon: '📣' },
      { href: '/admin/newsletter', label: 'Send log', icon: '📨' },
    ],
  },
  {
    heading: 'Messages',
    links: [
      { href: '/admin/inbox', label: 'Inbox', icon: '📬', countKey: 'inbox' },
    ],
  },
  {
    heading: 'CMS',
    links: [
      { href: '/admin/pages', label: 'Pages', icon: '📄' },
      { href: '/admin/navigation', label: 'Navigation', icon: '🗺️' },
      { href: '/admin/partners', label: 'Partners', icon: '🤝' },
      { href: '/admin/settings', label: 'Site settings', icon: '⚙️' },
      { href: '/admin/site-code', label: 'Site code', icon: '🧩' },
    ],
  },
];

/**
 * AdminLayout
 *
 * Desktop: 240px sticky sidebar + main content area.
 * Mobile (≤768px): sidebar hidden, bottom tab bar via <AdminBottomTabs/>.
 *
 * Counter system: layout fetches counts from getAdminCounts() on every render
 * (no caching — see directives at top). Counts are passed to <AdminBottomTabs>
 * for the mobile More sheet badges, AND rendered inline next to sidebar links
 * for desktop. Badge clears when the user visits the section page (each
 * section page calls markViewed() on render — see /admin/topics, /admin/inbox,
 * etc. for the pattern).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const counts = await getAdminCounts();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-0)' }}>
      <aside
        className="admin-sidebar"
        style={{
          width: 240,
          minHeight: '100vh',
          position: 'sticky',
          top: 0,
          flexShrink: 0,
          background: 'var(--bg-1)',
          borderRight: '1px solid var(--line)',
        }}
      >
        <div style={{ padding: 24, borderBottom: '1px solid var(--line)' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <span className="jgf-logo jgf-logo-bg" role="img" aria-label="Just Get Fit" style={{ width: 56, height: 36 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>Admin</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>justgetfit.org</div>
            </div>
          </Link>
        </div>
        <nav style={{ padding: '16px 12px' }}>
          {SECTIONS.map((sec) => (
            <div key={sec.heading} style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--text-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  padding: '0 12px 8px',
                }}
              >
                {sec.heading}
              </div>
              {sec.links.map((l) => {
                const count = l.countKey ? counts[l.countKey] : 0;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: 13,
                      color: 'var(--text-2)',
                      textDecoration: 'none',
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{l.icon}</span>
                    <span style={{ flex: 1 }}>{l.label}</span>
                    {count > 0 && (
                      <span
                        style={{
                          background: 'var(--neon)',
                          color: 'var(--bg-0)',
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 100,
                          minWidth: 18,
                          textAlign: 'center',
                          lineHeight: 1.4,
                        }}
                        aria-label={`${count} new`}
                      >
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--text-3)',
              textDecoration: 'none',
              borderTop: '1px solid var(--line)',
              marginTop: 8,
              paddingTop: 16,
            }}
          >
            <span>↗</span>
            <span>View site</span>
          </Link>
          <a
            href="/logout"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--text-3)',
              textDecoration: 'none',
            }}
          >
            <span>🔒</span>
            <span>Log out</span>
          </a>
        </nav>
      </aside>
      <main className="admin-main" style={{ flex: 1, minWidth: 0 }}>{children}</main>
      <AdminBottomTabs counts={counts} />
    </div>
  );
}
