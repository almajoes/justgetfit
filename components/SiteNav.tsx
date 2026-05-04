import Link from 'next/link';
import { getMainNav, getSiteSettings } from '@/lib/cms';
import { MobileMenuToggle } from './MobileMenuToggle';
import { SearchTrigger } from './SearchTrigger';

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
              {l.new_tab ? (
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label}
                </a>
              ) : (
                <Link href={l.url}>{l.label}</Link>
              )}
            </li>
          ))}
          {/* Search trigger — sits next to the regular links, before the CTA. */}
          <li className="nav-search-item">
            <SearchTrigger />
          </li>
          {ctaLink && (
            <li>
              {ctaLink.new_tab ? (
                <a href={ctaLink.url} target="_blank" rel="noopener noreferrer" className="nav-cta">
                  {ctaLink.label}
                </a>
              ) : (
                <Link href={ctaLink.url} className="nav-cta">
                  {ctaLink.label}
                </Link>
              )}
            </li>
          )}
        </ul>

        {/* Mobile: search + Subscribe button alongside hamburger */}
        <div className="nav-mobile-actions">
          {/* Mobile search trigger — same component, different placement.
              The trigger button is shown via a different CSS class (.search-trigger-mobile)
              and the overlay portals to body so it works the same regardless of context. */}
          <div className="nav-search-mobile">
            <SearchTrigger />
          </div>
          {ctaLink && (
            ctaLink.new_tab ? (
              <a href={ctaLink.url} target="_blank" rel="noopener noreferrer" className="nav-cta nav-cta-mobile">
                {ctaLink.label}
              </a>
            ) : (
              <Link href={ctaLink.url} className="nav-cta nav-cta-mobile">
                {ctaLink.label}
              </Link>
            )
          )}
          <MobileMenuToggle links={navItems.map((n) => ({ id: n.id, label: n.label, url: n.url, is_cta: n.is_cta, new_tab: n.new_tab }))} />
        </div>
      </div>
    </nav>
  );
}
