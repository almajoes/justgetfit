import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { getPartners } from '@/lib/cms';

export const revalidate = 60;

export const metadata = {
  title: 'Partners',
  description: 'Partners, recommended brands, and resources we stand behind.',
};

export default async function PartnersPage() {
  const partners = await getPartners();

  return (
    <>
      <SiteNav />

      <section className="partners-page">
        <div className="hero-pill" style={{ marginBottom: 24 }}>
          <span className="dot" />
          Partners & Resources
        </div>
        <h1 className="about-h1" style={{ marginBottom: 20 }}>
          People & places<br />we <span className="accent">stand behind</span>.
        </h1>
        <p style={{ fontSize: 18, color: 'var(--text-2)', marginBottom: 8, maxWidth: 720, lineHeight: 1.55 }}>
          A curated list of partners, recommended brands, and resources we actually use and trust. No
          pay-for-placement — these are sites we'd send a friend to.
        </p>

        <div className="partners-grid">
          {partners.map((p) => {
            const imgStyle: React.CSSProperties = p.image_url
              ? {
                  backgroundImage: `url('${p.image_url}')`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : { background: p.image_gradient || 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)' };

            return (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="partner-card"
              >
                <div className="partner-img" style={imgStyle}>
                  <div className="partner-img-overlay" />
                  {!p.image_url && p.initials && <span className="partner-mark">{p.initials}</span>}
                </div>
                <div className="partner-body">
                  {p.tag && <div className="partner-tag">{p.tag}</div>}
                  <div className="partner-name">{p.name}</div>
                  <div className="partner-blurb">{p.blurb}</div>
                  <span className="partner-cta">Visit site →</span>
                </div>
              </a>
            );
          })}
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
