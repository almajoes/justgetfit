import Link from 'next/link';
import { AdminBottomTabs } from '@/components/admin/AdminBottomTabs';

export const metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

const SECTIONS: { heading: string; links: { href: string; label: string; icon: string }[] }[] = [
  {
    heading: 'Content',
    links: [
      { href: '/admin/drafts', label: 'Drafts', icon: '📝' },
      { href: '/admin/posts', label: 'Posts', icon: '📰' },
      { href: '/admin/topics', label: 'Topic queue', icon: '💡' },
      { href: '/admin/generate', label: 'Generate articles', icon: '✨' },
    ],
  },
  {
    heading: 'Newsletter',
    links: [
      { href: '/admin/subscribers', label: 'Subscribers', icon: '👥' },
      { href: '/admin/broadcast', label: 'Broadcast', icon: '📣' },
      { href: '/admin/newsletter', label: 'Send log', icon: '📨' },
    ],
  },
  {
    heading: 'Messages',
    links: [
      { href: '/admin/inbox', label: 'Inbox', icon: '📬' },
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
 * Desktop: 240px sticky sidebar + main content area (existing layout).
 * Mobile (≤768px): sidebar hidden via CSS, fixed bottom tab bar replaces it,
 * main content gets bottom padding so the bar doesn't cover its bottom.
 *
 * The bottom tab bar is a client component (`<AdminBottomTabs />`) — needs
 * usePathname() for active highlighting + state for the More sheet. Sidebar
 * stays as server-rendered markup so server pages hydrate without an extra
 * client boundary.
 *
 * Pages should use className="admin-page-pad" on their outer wrapper so the
 * mobile media query can shrink page padding from 32px → 16px.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
              {sec.links.map((l) => (
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
                  <span>{l.label}</span>
                </Link>
              ))}
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
      <AdminBottomTabs />
    </div>
  );
}
