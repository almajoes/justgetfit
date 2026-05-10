import type { Source } from '@/lib/supabase';

/**
 * <ArticleSources />
 *
 * Renders the numbered Sources list at the bottom of an article.
 * Returns null when there are no sources, so we don't render an empty
 * "Sources" heading on uncited articles.
 *
 * Each source has an `id="source-N"` anchor so the inline [N] markers
 * in the body (rewritten to `<a href="#source-N">[N]</a>` by
 * lib/markdown.ts) jump to the right entry.
 *
 * Direct quotes (Source.quote) render with a small italic blockquote
 * under the source title. Source-only citations (quote === null) just
 * show the title + publication + link.
 */
export function ArticleSources({ sources }: { sources: Source[] | null | undefined }) {
  if (!sources || sources.length === 0) return null;

  return (
    <section
      id="sources"
      style={{
        marginTop: 56,
        paddingTop: 28,
        borderTop: '1px solid var(--line)',
      }}
    >
      <h2
        style={{
          fontSize: 13,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--neon)',
          marginBottom: 18,
        }}
      >
        Sources
      </h2>
      <ol
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {sources.map((s) => (
          <li
            key={s.n}
            id={`source-${s.n}`}
            style={{
              display: 'flex',
              gap: 10,
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--text-2)',
              // Highlight the target row when scrolled to via [N] anchor.
              // CSS :target pseudo-class handles the active state.
              scrollMarginTop: 24,
            }}
          >
            <span
              style={{
                flexShrink: 0,
                fontWeight: 700,
                color: 'var(--neon)',
                minWidth: 28,
                // Some browser+OS combinations render bracketed digits
                // as emoji-keycap glyphs (multi-color squares). Forcing
                // a non-emoji font stack here keeps "[N]" rendering as
                // ordinary text.
                fontFamily:
                  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              }}
            >
              [{s.n}]
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                style={{
                  color: 'var(--text)',
                  textDecoration: 'underline',
                  textDecorationColor: 'rgba(196,255,61,0.4)',
                  textUnderlineOffset: 3,
                  fontWeight: 500,
                }}
              >
                {s.title}
              </a>
              {s.publication && (
                <span style={{ color: 'var(--text-3)', marginLeft: 8, fontSize: 13 }}>
                  — {s.publication}
                </span>
              )}
              {s.quote && (
                <blockquote
                  style={{
                    margin: '8px 0 0 0',
                    padding: '6px 12px',
                    borderLeft: '2px solid rgba(196,255,61,0.4)',
                    fontStyle: 'italic',
                    fontSize: 13,
                    color: 'var(--text-2)',
                  }}
                >
                  &ldquo;{s.quote}&rdquo;
                </blockquote>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
