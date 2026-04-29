import Link from 'next/link';
import { getMainNav, getSiteSettings } from '@/lib/cms';

export async function SiteNav() {
  const [navItems, site] = await Promise.all([getMainNav(), getSiteSettings()]);

  const regularLinks = navItems.filter((n) => !n.is_cta);
  const ctaLink = navItems.find((n) => n.is_cta);

  return (
    <nav className="site-nav">
      <div className="nav-inner">
        <Link href="/" className="brand" aria-label={site.name}>
          <span className="jgf-logo jgf-logo-bg" role="img" aria-label={site.name} />
        </Link>
        <ul className="nav-menu">
          {regularLinks.map((l) => (
            <li key={l.id}>
              <Link href={l.url}>{l.label}</Link>
            </li>
          ))}
          {ctaLink && (
            <li>
              <Link href={ctaLink.url} className="nav-cta">
                {ctaLink.label}
              </Link>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}
