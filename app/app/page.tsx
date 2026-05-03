import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { AppCTA } from '@/components/AppCTA';
import Link from 'next/link';

// Refresh hourly — content is static-ish and we want SEO-cacheable HTML.
export const revalidate = 3600;

export const metadata = {
  title: 'The Just Get Fit App — Personalized Plans for Subscribers',
  description:
    'Track workouts, follow personalized routines, and get AI-generated meal plans. Free for Just Get Fit newsletter subscribers.',
  alternates: { canonical: '/app' },
  openGraph: {
    title: 'The Just Get Fit App',
    description:
      'Track workouts, follow personalized routines, and get AI-generated meal plans. Free for subscribers.',
    type: 'website',
  },
};

/**
 * /app — landing page on the blog promoting app.justgetfit.org
 *
 * Why this page exists on the blog (not on the app subdomain):
 *   - SEO: justgetfit.org has crawl history and authority. A page here will
 *     rank for "justgetfit app" searches faster than the app subdomain.
 *   - Marketing: this page can be styled as a marketing landing page even
 *     while the actual app at app.justgetfit.org is still in MVP.
 *   - Single source of truth: future blog content can link to /app and we
 *     control the messaging here.
 *
 * The actual app sign-in / sign-up flow lives on app.justgetfit.org. This
 * page is purely promotional + provides a clear entry point.
 */
export default async function AppLandingPage() {
  return (
    <>
      <SiteNav />
      <main style={{ maxWidth: 920, margin: '0 auto', padding: '64px 24px 96px' }}>
        {/* Hero — uses the AppCTA "hero" variant for the centerpiece */}
        <AppCTA variant="hero" />

        {/* How it works — three short steps */}
        <section style={{ marginTop: 80 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text-3)',
              marginBottom: 12,
            }}
          >
            How it works
          </div>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: 0,
              marginBottom: 40,
              color: 'var(--text)',
            }}
          >
            Three steps from inbox to action.
          </h2>

          <div
            className="app-steps"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 24,
            }}
          >
            <Step
              num="1"
              title="Subscribe to the newsletter"
              desc="The app uses your subscriber email to grant access. If you're already a subscriber, you're set — just sign in with the same email."
              cta={{ href: '/subscribe', label: 'Subscribe free →' }}
            />
            <Step
              num="2"
              title="Open the app"
              desc="Visit app.justgetfit.org and sign in with the email you subscribed with. You'll be in immediately."
            />
            <Step
              num="3"
              title="Tell it about you"
              desc="A short onboarding asks about your goals, current activity, and food preferences. Then it builds your plan."
            />
          </div>
        </section>

        {/* What you get — feature deep-dive */}
        <section style={{ marginTop: 80 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text-3)',
              marginBottom: 12,
            }}
          >
            What you get
          </div>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: 0,
              marginBottom: 40,
              color: 'var(--text)',
            }}
          >
            Three tools, one app, zero cost.
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <FeatureRow
              icon="📊"
              title="Fitness tracker"
              desc="Log workouts as you do them. See trends in volume, frequency, and progress over weeks and months. Spot when you're plateauing before it costs you."
            />
            <FeatureRow
              icon="💪"
              title="Personalized workout routines"
              desc="Built around your goals (strength, hypertrophy, conditioning, mobility) and adjusted to your current level. The app generates routines you can actually follow, not generic templates."
            />
            <FeatureRow
              icon="🥗"
              title="Meal plans"
              desc="AI-generated meal suggestions based on your dietary preferences, restrictions, and goals. Skip the meal-planning paralysis — get options that fit how you actually eat."
            />
          </div>
        </section>

        {/* FAQ — pre-empt the questions */}
        <section style={{ marginTop: 80 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text-3)',
              marginBottom: 12,
            }}
          >
            FAQ
          </div>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: 0,
              marginBottom: 32,
              color: 'var(--text)',
            }}
          >
            Quick answers.
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <FAQ
              q="Is it really free?"
              a="Yes. If you're a confirmed Just Get Fit newsletter subscriber, you have full access to the app at no cost. No payment info required, no hidden tiers."
            />
            <FAQ
              q="What if I'm not a subscriber yet?"
              a={
                <>
                  No problem — <Link href="/subscribe" style={{ color: 'var(--neon)' }}>subscribe free</Link>{' '}
                  with the email you'd use for the app. Once you confirm, you can sign in.
                </>
              }
            />
            <FAQ
              q="Do I need to install anything?"
              a="No. The app runs in your browser at app.justgetfit.org. Works on phone, tablet, or desktop."
            />
            <FAQ
              q="Can I use it without sharing my data?"
              a={
                <>
                  We only collect what's needed to personalize your plan (goals, preferences, workout
                  logs). Read our <Link href="/privacy" style={{ color: 'var(--neon)' }}>privacy policy</Link> for the full breakdown.
                </>
              }
            />
            <FAQ
              q="What if I want to delete my account?"
              a={
                <>
                  Email us via the <Link href="/contact" style={{ color: 'var(--neon)' }}>contact form</Link> and
                  we'll remove your account and all associated data.
                </>
              }
            />
          </div>
        </section>

        {/* Bottom CTA — second chance for readers who scrolled the whole page */}
        <section style={{ marginTop: 80, textAlign: 'center' }}>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: 0,
              marginBottom: 16,
              color: 'var(--text)',
            }}
          >
            Ready to get started?
          </h2>
          <p
            style={{
              fontSize: 16,
              color: 'var(--text-2)',
              lineHeight: 1.6,
              margin: 0,
              marginBottom: 28,
              maxWidth: 540,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            Open the app with the email you used to subscribe to the newsletter, or join the
            list first if you haven't already.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href="https://app.justgetfit.org"
              target="_blank"
              rel="noopener"
              className="btn btn-primary"
              style={{ fontSize: 15, padding: '12px 28px' }}
            >
              Open the app →
            </Link>
            <Link href="/subscribe" className="btn btn-ghost" style={{ fontSize: 15, padding: '12px 28px' }}>
              Subscribe to the newsletter
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />

      {/* Mobile: stack the 3-column "How it works" steps */}
      <style>{`
        @media (max-width: 640px) {
          .app-steps {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────

function Step({ num, title, desc, cta }: { num: string; title: string; desc: string; cta?: { href: string; label: string } }) {
  return (
    <div
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        padding: 24,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'rgba(196,255,61,0.12)',
          color: 'var(--neon)',
          fontSize: 14,
          fontWeight: 800,
          marginBottom: 16,
        }}
      >
        {num}
      </div>
      <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, marginBottom: 8, color: 'var(--text)' }}>
        {title}
      </h3>
      <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>{desc}</p>
      {cta && (
        <Link
          href={cta.href}
          style={{
            display: 'inline-block',
            marginTop: 12,
            fontSize: 13,
            color: 'var(--neon)',
            textDecoration: 'underline',
            textUnderlineOffset: 4,
          }}
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}

function FeatureRow({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: 20,
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        padding: 24,
      }}
    >
      <div style={{ fontSize: 32, lineHeight: 1 }} aria-hidden>
        {icon}
      </div>
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 8, color: 'var(--text)' }}>
          {title}
        </h3>
        <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
          {desc}
        </p>
      </div>
    </div>
  );
}

function FAQ({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
        {q}
      </div>
      <div style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.6 }}>
        {a}
      </div>
    </div>
  );
}
