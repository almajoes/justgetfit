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
 * Active state is determined by `usePathname()` with a `startsWith` check so
 * subroutes like /admin/posts/[id] still highlight the parent tab.
 *
 * Accessibility: each tab is a real <Link> so back/forward and middle-click
 * work normally. The tab bar has role=navigation. The More button toggles
 * aria-expanded. Hidden from screen readers on desktop via the same media query
 * that hides it visually.
 *
 * Why a fixed bottom bar (not a top header): native iOS/Android pattern, easier
 * to thumb-reach on tall phones, and the existing admin pages have heavy bottom
 * content (sticky save bars, send buttons) that we'd otherwise hide. We add
 * 64px bottom padding to <main> on mobile to compensate.
 */

type TabItem = {
  href: string;
  label: string;
  icon: string;
  // Routes that should highlight this tab (in addition to the exact href)
  activeWhenStartsWith?: string[];
};

const PRIMARY_TABS: TabItem[] = [
  { href: '/admin/drafts', label: 'Drafts', icon: '📝', activeWhenStartsWith: ['/admin/drafts'] },
  { href: '/admin/posts', label: 'Posts', icon: '📰', activeWhenStartsWith: ['/admin/posts'] },
  { href: '/admin/subscribers', label: 'Subs', icon: '👥', activeWhenStartsWith: ['/admin/subscribers'] },
  { href: '/admin/newsletter', label: 'Sends', icon: '📨', activeWhenStartsWith: ['/admin/newsletter'] },
  { href: '/admin/broadcast', label: 'Broadcast', icon: '📣', activeWhenStartsWith: ['/admin/broadcast'] },
];

export function AdminBottomTabs() {
  const pathname = usePathname() || '';
  const [moreOpen, setMoreOpen] = useState(false);

  function isActive(tab: TabItem) {
    if (pathname === tab.href) return true;
    return (tab.activeWhenStartsWith || []).some((p) => pathname.startsWith(p));
  }

  return (
    <>
      <nav
        role="navigation"
        aria-label="Admin sections"
        className="admin-bottom-tabs"
      >
        {PRIMARY_TABS.map((tab) => {
          const active = isActive(tab);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="admin-bottom-tab"
              data-active={active ? 'true' : 'false'}
            >
              <span className="admin-bottom-tab__icon" aria-hidden>{tab.icon}</span>
              <span className="admin-bottom-tab__label">{tab.label}</span>
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
        >
          <span className="admin-bottom-tab__icon" aria-hidden>⋯</span>
          <span className="admin-bottom-tab__label">More</span>
        </button>
      </nav>

      {moreOpen && <AdminMoreSheet onClose={() => setMoreOpen(false)} currentPath={pathname} />}
    </>
  );
}
