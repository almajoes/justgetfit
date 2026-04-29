import Link from 'next/link';

type Crumb = {
  label: string;
  href?: string; // omit for the current/last crumb
};

/**
 * Breadcrumbs nav. Last item is rendered as plain text (no link).
 * Use on category archives and article detail pages for orientation + SEO.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        {items.map((c, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`}>
              {c.href && !isLast ? (
                <Link href={c.href}>{c.label}</Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined}>{c.label}</span>
              )}
              {!isLast && <span className="breadcrumb-sep" aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
