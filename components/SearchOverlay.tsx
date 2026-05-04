'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

/**
 * <SearchOverlay />
 *
 * The search modal — should be mounted ONCE at the root layout level. Listens
 * for two open signals:
 *   1. Cmd/Ctrl+K keyboard shortcut (global)
 *   2. Custom 'jgf:open-search' window event, dispatched by <SearchTrigger />
 *      buttons in the nav. Multiple triggers can exist; the overlay is single.
 *
 * UX:
 *   - Type → debounced 250ms search request to /api/search
 *   - ↑↓ to cycle highlighted result
 *   - Enter → navigate to highlighted result
 *   - Esc → close, clear input
 *   - Click backdrop → close
 *   - Click result → navigate
 *
 * Portals to document.body to escape stacking contexts.
 */

type SearchResult = {
  slug: string;
  category: string;
  title: string;
  excerpt: string | null;
};

const DEBOUNCE_MS = 250;
export const SEARCH_OPEN_EVENT = 'jgf:open-search';

export function SearchOverlay() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [mounted, setMounted] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Listen for trigger button events
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener(SEARCH_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(SEARCH_OPEN_EVENT, onOpen);
  }, []);

  // Cmd/Ctrl+K shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  // Auto-focus input when overlay opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // In-overlay keyboard handling
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        const target = results[highlighted];
        if (target) {
          e.preventDefault();
          navigateTo(target);
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, results, highlighted]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      runSearch(query);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  async function runSearch(q: string) {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: ctrl.signal,
      });
      if (res.ok) {
        const json = await res.json();
        setResults(json.results || []);
        setHighlighted(0);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[search] failed:', err);
      }
    } finally {
      setLoading(false);
    }
  }

  function navigateTo(r: SearchResult) {
    setOpen(false);
    setQuery('');
    setResults([]);
    router.push(`/articles/${r.category}/${r.slug}`);
  }

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search articles"
        style={{
          position: 'fixed',
          top: '15vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(640px, calc(100vw - 32px))',
          maxHeight: '70vh',
          background: 'var(--bg-1, #1a1a1a)',
          border: '1px solid var(--line, #2a2a2a)',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontSize: 17,
              fontFamily: 'inherit',
            }}
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setResults([]);
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-3)',
                cursor: 'pointer',
                padding: 4,
                fontSize: 14,
              }}
            >
              ✕
            </button>
          )}
          <kbd
            style={{
              fontSize: 11,
              color: 'var(--text-3)',
              background: 'rgba(255,255,255,0.05)',
              padding: '3px 8px',
              borderRadius: 4,
              border: '1px solid var(--line)',
              fontFamily: 'inherit',
            }}
          >
            esc
          </kbd>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {query.trim().length < 2 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
              Type at least 2 characters to search.
            </div>
          )}
          {query.trim().length >= 2 && loading && results.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
              Searching…
            </div>
          )}
          {query.trim().length >= 2 && !loading && results.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
              No articles found for &ldquo;{query}&rdquo;.
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={r.slug}
              type="button"
              onClick={() => navigateTo(r)}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '14px 20px',
                background: i === highlighted ? 'rgba(196,255,61,0.08)' : 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--line)',
                color: 'var(--text)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: i === highlighted ? 'var(--neon)' : 'var(--text-3)',
                  marginBottom: 4,
                }}
              >
                {r.category}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{r.title}</div>
              {r.excerpt && (
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--text-2)',
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {r.excerpt}
                </div>
              )}
            </button>
          ))}
        </div>

        {results.length > 0 && (
          <div style={{ padding: '10px 20px', borderTop: '1px solid var(--line)', fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 16 }}>
            <span><kbd style={kbdStyle}>↑↓</kbd> navigate</span>
            <span><kbd style={kbdStyle}>↵</kbd> open</span>
            <span><kbd style={kbdStyle}>esc</kbd> close</span>
          </div>
        )}
      </div>
    </>,
    document.body
  );
}

const kbdStyle: React.CSSProperties = {
  fontSize: 10,
  background: 'rgba(255,255,255,0.05)',
  padding: '2px 6px',
  borderRadius: 3,
  border: '1px solid var(--line)',
  fontFamily: 'inherit',
};
