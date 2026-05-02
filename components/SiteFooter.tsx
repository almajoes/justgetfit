import Link from 'next/link';
import { getFooterQuickLinks, getFooterCategories, getFooterSettings, getSiteSettings } from '@/lib/cms';

export async function SiteFooter() {
  const [quickLinks, categories, footer, site] = await Promise.all([
    getFooterQuickLinks(),
    getFooterCategories(),
    getFooterSettings(),
    getSiteSettings(),
  ]);

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-grid">
          <div className="col footer-brand">
            <Link href="/" className="brand">
              <span className="jgf-logo jgf-logo-md jgf-logo-bg" role="img" aria-label={site.name} />
            </Link>
            <p style={{ marginTop: 16 }}>{footer.brand_tagline}</p>
          </div>
          <div className="col">
            <h5>Quick Links</h5>
            <ul>
              {quickLinks.map((l) => (
                <li key={l.id}>
                  <Link href={l.url}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="col col-categories">
            <h5>Categories</h5>
            <ul>
              {categories.map((l) => (
                <li key={l.id}>
                  <Link href={l.url}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>{footer.copyright}</span>
          <span className="footer-legal-links" style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
            <Link href="/privacy" style={{ color: 'inherit' }}>Privacy</Link>
            <span aria-hidden style={{ opacity: 0.4 }}>·</span>
            <Link href="/terms" style={{ color: 'inherit' }}>Terms</Link>
          </span>
          <span>{footer.version_label}</span>
        </div>
      </div>
    </footer>
  );
}
