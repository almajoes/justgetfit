import Link from 'next/link';
import type { AppPage } from '@/lib/supabase';

/**
 * <AppCTA />
 *
 * Three-column feature card promoting app.justgetfit.org. Used on:
 *   - End of every article (between content and disclaimer) — "inline" variant
 *   - The /app landing page top — "hero" variant
 *
 * Content is CMS-managed via /admin/pages/app — pass an AppPage `content`
 * prop. Both variants share the same eyebrow, headline, feature cards, and
 * primary button URL; subhead text, primary button label, and secondary
 * link differ per variant (and are stored as separate fields in AppPage).
 *
 * Variants:
 *   - 'inline' — at end of articles. Compact, content-area-width.
 *   - 'hero'   — on /app. Larger feature treatment with longer subhead.
 *
 * Server component. No client interactivity needed.
 */

type Variant = 'inline' | 'hero';

export function AppCTA({ variant = 'inline', content }: { variant?: Variant; content: AppPage }) {
  const isHero = variant === 'hero';

  // Pick variant-specific fields from the shared content object.
  const subhead = isHero ? content.cta_subhead_hero : content.cta_subhead_inline;
  const primaryLabel = isHero ? content.cta_primary_label_hero : content.cta_primary_label_inline;
  const secondaryLabel = isHero ? content.cta_secondary_label_hero : content.cta_secondary_label_inline;
  const secondaryHref = isHero ? content.cta_secondary_href_hero : content.cta_secondary_href_inline;
  const primaryUrl = content.cta_primary_url || 'https://app.justgetfit.org';

  // Detect external URL for primary CTA — opens in new tab if external.
  const primaryIsExternal = /^https?:\/\//i.test(primaryUrl);
  const secondaryIsExternal = /^https?:\/\//i.test(secondaryHref || '');

  return (
    <section
      className="app-cta-card"
      style={{
        marginTop: isHero ? 0 : 60,
        padding: isHero ? '48px 32px' : 32,
        borderRadius: 20,
        background:
          'linear-gradient(135deg, rgba(196,255,61,0.08) 0%, rgba(196,255,61,0.02) 100%)',
        border: '1px solid rgba(196,255,61,0.25)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative corner accent */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -40,
          right: -40,
          width: 160,
          height: 160,
          background: 'radial-gradient(circle, rgba(196,255,61,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative' }}>
        {/* Eyebrow */}
        {content.cta_eyebrow && (
          <div
            style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--neon)',
              background: 'rgba(196,255,61,0.1)',
              padding: '4px 10px',
              borderRadius: 4,
              marginBottom: 16,
            }}
          >
            {content.cta_eyebrow}
          </div>
        )}

        {/* Headline */}
        {content.cta_headline && (
          <h2
            style={{
              fontSize: isHero ? 36 : 24,
              fontWeight: 800,
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              margin: 0,
              marginBottom: 8,
              color: 'var(--text)',
            }}
          >
            {content.cta_headline}
          </h2>
        )}

        {/* Subhead */}
        {subhead && (
          <p
            style={{
              fontSize: isHero ? 17 : 15,
              color: 'var(--text-2)',
              lineHeight: 1.6,
              margin: 0,
              marginBottom: 28,
              maxWidth: 640,
            }}
          >
            {subhead}
          </p>
        )}

        {/* 3-column feature grid */}
        {content.cta_features && content.cta_features.length > 0 && (
          <div
            className="app-cta-features"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(content.cta_features.length, 3)}, 1fr)`,
              gap: 20,
              marginBottom: 32,
            }}
          >
            {content.cta_features.map((f, i) => (
              <div key={i}>
                <div style={{ fontSize: 28, marginBottom: 8, lineHeight: 1 }} aria-hidden>
                  {f.icon}
                </div>
                <h3
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    margin: 0,
                    marginBottom: 6,
                    color: 'var(--text)',
                  }}
                >
                  {f.title}
                </h3>
                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--text-2)',
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {primaryLabel && (
            primaryIsExternal ? (
              <a
                href={primaryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ fontSize: 15, padding: '12px 28px' }}
              >
                {primaryLabel}
              </a>
            ) : (
              <Link
                href={primaryUrl}
                className="btn btn-primary"
                style={{ fontSize: 15, padding: '12px 28px' }}
              >
                {primaryLabel}
              </Link>
            )
          )}
          {secondaryLabel && secondaryHref && (
            secondaryIsExternal ? (
              <a
                href={secondaryHref}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 14,
                  color: 'var(--text-2)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 4,
                }}
              >
                {secondaryLabel}
              </a>
            ) : (
              <Link
                href={secondaryHref}
                style={{
                  fontSize: 14,
                  color: 'var(--text-2)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 4,
                }}
              >
                {secondaryLabel}
              </Link>
            )
          )}
        </div>
      </div>

      {/* Mobile: collapse multi-column features to single column */}
      <style>{`
        @media (max-width: 640px) {
          .app-cta-features {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
        }
      `}</style>
    </section>
  );
}
