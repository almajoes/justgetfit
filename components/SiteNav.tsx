import Link from 'next/link';
import { getMainNav, getSiteSettings } from '@/lib/cms';
import { MobileMenuToggle } from './MobileMenuToggle';

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

        {/* Desktop menu */}
        <ul className="nav-menu nav-menu-desktop">
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

        {/* Mobile: Subscribe button alongside hamburger */}
        <div className="nav-mobile-actions">
          {ctaLink && (
            <Link href={ctaLink.url} className="nav-cta nav-cta-mobile">
              {ctaLink.label}
            </Link>
          )}
          <MobileMenuToggle links={navItems.map((n) => ({ id: n.id, label: n.label, url: n.url, is_cta: n.is_cta }))} />
        </div>
      </div>
    </nav>
  );
}
