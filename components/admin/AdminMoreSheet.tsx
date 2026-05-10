'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

/**
 * <AdminMoreSheet />
 *
 * Slide-up bottom sheet showing all the admin sections that don't fit in the
 * 5-tab bottom bar. Rendered via React Portal to escape any parent stacking
 * contexts / overflow clipping.
 *
 * Auto-closes on:
 *  - tap on backdrop
 *  - tap on a link (navigating away)
 *  - Escape key
 *
 * Body scroll is locked while the sheet is open to prevent the page underneath
 * from drifting when the user scrolls inside the sheet.
 *
 * The "View site" and "Log out" links live here too so the sidebar's full
 * functionality remains accessible from the mobile UX.
 */

type Counts = {
  drafts: number;
  topics: number;
  subscribers: number;
  inbox: number;
};

const MORE_SECTIONS: { heading: string; links: { href: string; label: string; icon: string; countKey?: 'drafts' | 'topics' | 'subscribers' | 'inbox' }[] }[] = [
  {
    heading: 'Insights',
    links: [
      { href: '/admin/analytics', label: 'Analytics', icon: '📊' },
    ],
  },
  {
    heading: 'Content',
    links: [
      { href: '/admin/authors', label: 'Authors', icon: '✍️' },
      { href: '/admin/sources', label: 'Sources', icon: '🔗' },
      { href: '/admin/topics', label: 'Topic queue', icon: '💡', countKey: 'topics' },
      { href: '/admin/generate', label: 'Generate articles', icon: '✨' },
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

export function AdminMoreSheet({ onClose, currentPath, counts }: { onClose: () => void; currentPath: string; counts?: Counts }) {
  // Lock body scroll while open + handle Escape
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // SSR safety — only render once mounted client-side
  if (typeof document === 'undefined') return null;

  const sheet = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="More admin sections"
      className="admin-more-sheet-root"
    >
      <div className="admin-more-sheet-backdrop" onClick={onClose} />
      <div className="admin-more-sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-more-sheet-handle" />
        <div className="admin-more-sheet-content">
          {MORE_SECTIONS.map((sec) => (
            <div key={sec.heading} style={{ marginBottom: 24 }}>
              <div className="admin-more-sheet-heading">{sec.heading}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {sec.links.map((l) => {
                  const active = currentPath === l.href || currentPath.startsWith(l.href + '/');
                  const count = (l.countKey && counts) ? counts[l.countKey] : 0;
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={onClose}
                      className="admin-more-sheet-link"
                      data-active={active ? 'true' : 'false'}
                    >
                      <span style={{ fontSize: 18 }}>{l.icon}</span>
                      <span style={{ flex: 1 }}>{l.label}</span>
                      {count > 0 && (
                        <span
                          style={{
                            background: 'var(--neon)',
                            color: 'var(--bg-0)',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 100,
                            minWidth: 20,
                            textAlign: 'center',
                          }}
                          aria-label={`${count} new`}
                        >
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                      {active && count === 0 && <span style={{ fontSize: 11, color: 'var(--neon)' }}>●</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Link href="/" onClick={onClose} className="admin-more-sheet-link">
              <span style={{ fontSize: 18 }}>↗</span>
              <span style={{ flex: 1 }}>View site</span>
            </Link>
            <a href="/logout" onClick={onClose} className="admin-more-sheet-link">
              <span style={{ fontSize: 18 }}>🔒</span>
              <span style={{ flex: 1 }}>Log out</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
