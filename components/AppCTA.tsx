import Link from 'next/link';

/**
 * <AppCTA />
 *
 * Three-column feature card promoting app.justgetfit.org. Used on:
 *   - End of every article (between content and disclaimer)
 *   - The /app landing page
 *
 * Per the May 3 conversation: app provides three features:
 *   - Fitness tracker
 *   - Workout routines
 *   - Meal plans
 *
 * Access is free for confirmed newsletter subscribers — the app shares
 * Just Get Fit's Supabase database and gates by `subscribers.status =
 * 'confirmed'`. CTA copy reflects this: "free for subscribers".
 *
 * Variants:
 *   - 'inline' — used at end of articles. Compact, content-area-width.
 *   - 'hero'   — used on /app. Larger feature treatment with extra subhead.
 *
 * Both variants are server-rendered (no client interactivity needed) and
 * wrap features in a 3-col grid that collapses to 1-col on mobile via the
 * existing `.admin-grid-3` utility class plus a same-named site CSS rule
 * (or fallback inline media query if the site CSS doesn't have one).
 */

type Variant = 'inline' | 'hero';

const APP_URL = 'https://app.justgetfit.org';

const FEATURES = [
  {
    icon: '📊',
    title: 'Fitness tracker',
    desc: 'Log workouts, track progress, and see your trends over time.',
  },
  {
    icon: '💪',
    title: 'Workout routines',
    desc: 'Personalized routines based on your goals and experience.',
  },
  {
    icon: '🥗',
    title: 'Meal plans',
    desc: 'AI-generated meal plans built around your preferences.',
  },
];

export function AppCTA({ variant = 'inline' }: { variant?: Variant }) {
  const isHero = variant === 'hero';
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
      {/* Decorative corner accent — subtle visual interest without being noisy */}
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
        {/* Eyebrow / tag */}
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
          New · The Just Get Fit App
        </div>

        {/* Headline */}
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
          Get personalized plans that adapt to you.
        </h2>

        {/* Subhead */}
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
          {isHero
            ? 'Track workouts, follow personalized routines, and get meal plans built around your goals and preferences. Free for Just Get Fit newsletter subscribers — the app uses your existing email to grant access automatically.'
            : 'Track workouts, follow personalized routines, and get AI-generated meal plans. Free for newsletter subscribers.'}
        </p>

        {/* 3-column feature grid */}
        <div
          className="app-cta-features"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 20,
            marginBottom: 32,
          }}
        >
          {FEATURES.map((f) => (
            <div key={f.title}>
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

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link
            href={APP_URL}
            target="_blank"
            rel="noopener"
            className="btn btn-primary"
            style={{ fontSize: 15, padding: '12px 28px' }}
          >
            {isHero ? 'Open the app →' : 'Try the app →'}
          </Link>
          {!isHero && (
            <Link
              href="/app"
              style={{
                fontSize: 14,
                color: 'var(--text-2)',
                textDecoration: 'underline',
                textUnderlineOffset: 4,
              }}
            >
              Learn more
            </Link>
          )}
          {isHero && (
            <Link
              href="/subscribe"
              style={{
                fontSize: 14,
                color: 'var(--text-2)',
                textDecoration: 'underline',
                textUnderlineOffset: 4,
              }}
            >
              Not a subscriber yet? Join free
            </Link>
          )}
        </div>
      </div>

      {/* Mobile: collapse 3-column features to single column. Inline so we
          don't depend on globals.css being aware of this component. */}
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
