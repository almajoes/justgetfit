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

        {/* Empty state. Shown when the partners list is empty (typical
            during early days). Same on-brand voice as the main copy:
            picky-by-default, no pay-for-placement, here's how to reach
            out if you actually fit. Hidden as soon as one partner is
            added via the CMS. */}
        {partners.length === 0 && (
          <div
            style={{
              marginTop: 24,
              padding: '40px 32px',
              background: 'var(--bg-1)',
              border: '1px solid var(--line)',
              borderRadius: 16,
              maxWidth: 720,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--neon)',
                marginBottom: 14,
              }}
            >
              Currently empty — by design
            </div>
            <h2
              style={{
                fontSize: 'clamp(22px, 2.6vw, 28px)',
                fontWeight: 800,
                letterSpacing: '-0.01em',
                marginBottom: 14,
                lineHeight: 1.25,
              }}
            >
              We&rsquo;re picky about who shows up here.
            </h2>
            <p style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 14 }}>
              No paid placements. No affiliate-of-the-week. Partners and recommended brands earn
              their slot by being something we&rsquo;d genuinely point a reader to — gear that
              actually works, coaches who know what they&rsquo;re doing, tools we use ourselves.
            </p>
            <p style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 24 }}>
              If you run something in the strength, hypertrophy, conditioning, nutrition, or
              recovery space and think there&rsquo;s a real fit — we&rsquo;d love to hear from
              you.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a href="/contact" className="btn btn-primary">
                Get in touch →
              </a>
              <a
                href="/articles"
                className="btn btn-ghost"
                style={{ textDecoration: 'none' }}
              >
                Read the articles first
              </a>
            </div>
          </div>
        )}
      </section>

      <SiteFooter />
    </>
  );
}
