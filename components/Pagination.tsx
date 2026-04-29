import Link from 'next/link';

/**
 * Pagination component for archive pages.
 *
 * Renders previous/next links + numbered pages.
 * Uses query string ?page=N for navigation.
 */
export function Pagination({
  currentPage,
  totalPages,
  basePath,
}: {
  currentPage: number;
  totalPages: number;
  basePath: string; // e.g. "/articles" or "/articles/strength"
}) {
  if (totalPages <= 1) return null;

  // Build a list of page numbers to show: always show first, last, current, +/- 1 from current.
  // Add ellipses where there are gaps. e.g. on page 5 of 10: 1 ... 4 5 6 ... 10
  const pages: (number | 'ellipsis')[] = [];
  const showRange = 1; // pages on either side of current

  for (let p = 1; p <= totalPages; p++) {
    if (
      p === 1 ||
      p === totalPages ||
      (p >= currentPage - showRange && p <= currentPage + showRange)
    ) {
      pages.push(p);
    } else if (
      pages[pages.length - 1] !== 'ellipsis' &&
      ((p < currentPage - showRange) || (p > currentPage + showRange))
    ) {
      pages.push('ellipsis');
    }
  }

  function pageHref(p: number): string {
    if (p === 1) return basePath;
    return `${basePath}?page=${p}`;
  }

  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <nav
      aria-label="Pagination"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        flexWrap: 'wrap',
        marginTop: 48,
        paddingTop: 32,
        borderTop: '1px solid var(--line)',
      }}
    >
      {prevDisabled ? (
        <span style={pageButtonStyle(false, true)}>← Previous</span>
      ) : (
        <Link href={pageHref(currentPage - 1)} style={pageButtonStyle(false, false)}>
          ← Previous
        </Link>
      )}

      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`ellipsis-${i}`} style={ellipsisStyle}>
            …
          </span>
        ) : (
          <Link
            key={p}
            href={pageHref(p)}
            style={pageButtonStyle(p === currentPage, false)}
          >
            {p}
          </Link>
        )
      )}

      {nextDisabled ? (
        <span style={pageButtonStyle(false, true)}>Next →</span>
      ) : (
        <Link href={pageHref(currentPage + 1)} style={pageButtonStyle(false, false)}>
          Next →
        </Link>
      )}
    </nav>
  );
}

function pageButtonStyle(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 38,
    height: 38,
    padding: '0 12px',
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    textDecoration: 'none',
    border: `1px solid ${active ? 'var(--neon)' : 'var(--line)'}`,
    background: active ? 'var(--neon)' : 'transparent',
    color: active ? '#000' : disabled ? 'var(--text-3)' : 'var(--text-2)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s ease',
  };
}

const ellipsisStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 38,
  height: 38,
  fontSize: 13,
  color: 'var(--text-3)',
};
