'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type NavLink = {
  id: string;
  label: string;
  url: string;
  is_cta: boolean;
};

export function MobileMenuToggle({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);

  // Lock body scroll when menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Close menu on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
  }, [open]);

  const regularLinks = links.filter((l) => !l.is_cta);

  return (
    <>
      {/* Hamburger button — only visible on mobile (CSS handles via `mobile-menu-toggle` class) */}
      <button
        type="button"
        className="mobile-menu-toggle"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={`hamburger ${open ? 'is-open' : ''}`} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {/* Slide-out menu */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="mobile-menu-backdrop"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Menu panel */}
          <div className="mobile-menu-panel" role="dialog" aria-modal="true" aria-label="Site navigation">
            <button
              type="button"
              className="mobile-menu-close"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>

            <nav className="mobile-menu-nav">
              <ul>
                <li>
                  <Link href="/" onClick={() => setOpen(false)}>
                    Home
                  </Link>
                </li>
                {regularLinks.map((l) => (
                  <li key={l.id}>
                    <Link href={l.url} onClick={() => setOpen(false)}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="mobile-menu-footer">
              <p>Just Get Fit</p>
              <p style={{ fontStyle: 'italic', color: 'var(--neon)' }}>Stronger. Every day.</p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
