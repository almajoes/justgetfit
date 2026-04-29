'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

type NavLink = {
  id: string;
  label: string;
  url: string;
  is_cta: boolean;
};

export function MobileMenuToggle({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Track mount state - portal can only render after client mount
  useEffect(() => {
    setMounted(true);
  }, []);

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

  // Hamburger button stays inside the nav as before
  const hamburger = (
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
  );

  // Panel and backdrop are PORTALED to document.body to escape the nav's
  // containing block (the nav has backdrop-filter, which would otherwise
  // make `position: fixed` resolve relative to the nav, not the viewport)
  const panel = open && mounted ? createPortal(
    <>
      <div
        className="mobile-menu-backdrop"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
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
              <Link href="/" onClick={() => setOpen(false)}>Home</Link>
            </li>
            {regularLinks.map((l) => (
              <li key={l.id}>
                <Link href={l.url} onClick={() => setOpen(false)}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mobile-menu-footer">
          <p>Just Get Fit</p>
          <p style={{ fontStyle: 'italic', color: 'var(--neon)' }}>Stronger. Every day.</p>
        </div>
      </div>
    </>,
    document.body
  ) : null;

  return (
    <>
      {hamburger}
      {panel}
    </>
  );
}
