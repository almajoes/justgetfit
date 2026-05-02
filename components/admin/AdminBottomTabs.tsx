'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { AdminMoreSheet } from './AdminMoreSheet';

/**
 * <AdminBottomTabs />
 *
 * Fixed bottom navigation visible only on mobile (≤768px). Renders as a row of
 * 5 primary destinations + a "More" overflow button that opens a slide-up sheet
 * with the rest of the admin sections.
 *
 * The 5 primaries (Drafts / Posts / Subscribers / Send log / Broadcast) are the
 * day-to-day surfaces — content review, list management, send analytics. The
 * remaining sections (Topic queue, Generate, Pages, Navigation, Partners,
 * Settings, Site code) are infrequent setup tasks and live in More.
 *
 * Counter badges: receives `counts` from the server-rendered admin layout.
 * Drafts and Subs primary tabs get inline badges. The Inbox and Topic queue
 * counts live in the More sheet so the More button itself shows a small dot
 * if there's any unviewed activity in the overflow section.
 */

type TabItem = {
  href: string;
  label: string;
  icon: string;
  countKey?: 'drafts' | 'topics' | 'subscribers' | 'inbox';
  activeWhenStartsWith?: string[];
};

type Counts = {
  drafts: number;
  topics: number;
  subscribers: number;
  inbox: number;
};

const PRIMARY_TABS: TabItem[] = [
  { href: '/admin/drafts', label: 'Drafts', icon: '📝', countKey: 'drafts', activeWhenStartsWith: ['/admin/drafts'] },
  { href: '/admin/posts', label: 'Posts', icon: '📰', activeWhenStartsWith: ['/admin/posts'] },
  { href: '/admin/subscribers', label: 'Subs', icon: '👥', countKey: 'subscribers', activeWhenStartsWith: ['/admin/subscribers'] },
  { href: '/admin/newsletter', label: 'Sends', icon: '📨', activeWhenStartsWith: ['/admin/newsletter'] },
  { href: '/admin/broadcast', label: 'Broadcast', icon: '📣', activeWhenStartsWith: ['/admin/broadcast'] },
];

export function AdminBottomTabs({ counts }: { counts: Counts }) {
  const pathname = usePathname() || '';
  const [moreOpen, setMoreOpen] = useState(false);

  function isActive(tab: TabItem) {
    if (pathname === tab.href) return true;
    return (tab.activeWhenStartsWith || []).some((p) => pathname.startsWith(p));
  }

  // Dot on the More button if there's anything unviewed in the overflow
  // (Topic queue or Inbox — the two countable sections that live in More).
  const moreHasActivity = counts.topics > 0 || counts.inbox > 0;

  return (
    <>
      <nav
        role="navigation"
        aria-label="Admin sections"
        className="admin-bottom-tabs"
      >
        {PRIMARY_TABS.map((tab) => {
          const active = isActive(tab);
          const count = tab.countKey ? counts[tab.countKey] : 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="admin-bottom-tab"
              data-active={active ? 'true' : 'false'}
              style={{ position: 'relative' }}
            >
              <span className="admin-bottom-tab__icon" aria-hidden>{tab.icon}</span>
              <span className="admin-bottom-tab__label">{tab.label}</span>
              {count > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: '50%',
                    marginRight: -18,
                    background: 'var(--neon)',
                    color: 'var(--bg-0)',
                    fontSize: 9,
                    fontWeight: 800,
                    padding: '1px 5px',
                    borderRadius: 100,
                    minWidth: 16,
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
        <button
          type="button"
          className="admin-bottom-tab"
          aria-expanded={moreOpen}
          aria-haspopup="true"
          onClick={() => setMoreOpen(true)}
          data-active={moreOpen ? 'true' : 'false'}
          style={{ position: 'relative' }}
        >
          <span className="admin-bottom-tab__icon" aria-hidden>⋯</span>
          <span className="admin-bottom-tab__label">More</span>
          {moreHasActivity && (
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: '50%',
                marginRight: -14,
                width: 8,
                height: 8,
                background: 'var(--neon)',
                borderRadius: '50%',
              }}
              aria-label="New activity in More"
            />
          )}
        </button>
      </nav>

      {moreOpen && <AdminMoreSheet onClose={() => setMoreOpen(false)} currentPath={pathname} counts={counts} />}
    </>
  );
}
