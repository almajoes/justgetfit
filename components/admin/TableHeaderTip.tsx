'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * Column header with an inline `?` icon that reveals a help tooltip.
 *
 * Behavior:
 *   - Desktop hover: tooltip shows on hover (CSS, instant)
 *   - Mobile/touch tap: tooltip toggles open/closed on tap
 *   - Click outside or Esc: closes the tooltip
 *
 * Why a real component (not the native `title` attribute)?
 * `title` only works on desktop hover — mobile users have no way to
 * discover what the column means. The visible `?` icon plus tap
 * interaction makes it discoverable everywhere.
 */
export function TableHeaderTip({ label, tip }: { label: string; tip: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Close on click outside or Esc keypress
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        position: 'relative',
      }}
    >
      {label}
      <button
        type="button"
        aria-label={`What does ${label} mean?`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="th-tip-trigger"
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '1px solid var(--text-3)',
          background: 'transparent',
          color: 'var(--text-3)',
          fontSize: 9,
          fontWeight: 700,
          lineHeight: 1,
          cursor: 'pointer',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.6,
          transition: 'opacity 120ms',
        }}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 50,
            background: 'var(--bg-2, #1a1a1a)',
            color: 'var(--text)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 400,
            lineHeight: 1.4,
            letterSpacing: 0,
            textTransform: 'none',
            width: 240,
            maxWidth: '70vw',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            whiteSpace: 'normal',
          }}
        >
          {tip}
        </span>
      )}
      <style>{`
        .th-tip-trigger:hover { opacity: 1 !important; }
      `}</style>
    </span>
  );
}
