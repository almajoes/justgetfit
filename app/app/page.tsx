import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { AppCTA } from '@/components/AppCTA';
import { getAppPage } from '@/lib/cms';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Refresh hourly — content is admin-edited via /admin/pages/app and the
// admin save flow calls revalidatePath('/app') so changes also propagate
// immediately on save without waiting for the hour.
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
 * Content management: the hero/AppCTA at the top is hardcoded (shared with
 * article-end CTAs — see components/AppCTA.tsx). Everything below the hero
 * is CMS-managed via /admin/pages/app and pulled from the `pages` table by
 * `getAppPage()`.
 */
export default async function AppLandingPage() {
  const page = await getAppPage();

  return (
    <>
      <SiteNav />
      <main style={{ maxWidth: 920, margin: '0 auto', padding: '64px 24px 96px' }}>
        {/* Hero — uses the AppCTA "hero" variant for the centerpiece.
            Now CMS-managed via /admin/pages/app under the Hero/CTA section. */}
        <AppCTA variant="hero" content={page} />

        {/* How it works — three short steps */}
        {page.steps && page.steps.length > 0 && (
          <section style={{ marginTop: 80 }}>
            <Eyebrow>{page.how_it_works_eyebrow}</Eyebrow>
            <SectionHeading>{page.how_it_works_heading}</SectionHeading>

            <div
              className="app-steps"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(page.steps.length, 3)}, 1fr)`,
                gap: 24,
              }}
            >
              {page.steps.map((step, i) => (
                <Step
                  key={i}
                  num={String(i + 1)}
                  title={step.title}
                  desc={step.desc}
                  cta={step.cta_label && step.cta_href ? { href: step.cta_href, label: step.cta_label } : undefined}
                />
              ))}
            </div>
          </section>
        )}

        {/* What you get — feature deep-dive */}
        {page.features && page.features.length > 0 && (
          <section style={{ marginTop: 80 }}>
            <Eyebrow>{page.features_eyebrow}</Eyebrow>
            <SectionHeading>{page.features_heading}</SectionHeading>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {page.features.map((f, i) => (
                <FeatureRow key={i} icon={f.icon} title={f.title} desc={f.desc} />
              ))}
            </div>
          </section>
        )}

        {/* FAQ */}
        {page.faqs && page.faqs.length > 0 && (
          <section style={{ marginTop: 80 }}>
            <Eyebrow>{page.faq_eyebrow}</Eyebrow>
            <SectionHeading style={{ marginBottom: 32 }}>{page.faq_heading}</SectionHeading>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {page.faqs.map((f, i) => (
                <FAQ key={i} q={f.q} a={f.a} />
              ))}
            </div>
          </section>
        )}

        {/* Bottom CTA — second chance for readers who scrolled the whole page */}
        {(page.bottom_cta_heading || page.bottom_cta_primary_label) && (
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
              {page.bottom_cta_heading}
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
              {page.bottom_cta_subhead}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {page.bottom_cta_primary_label && (
                <SmartLink
                  href={page.bottom_cta_primary_href || '#'}
                  className="btn btn-primary"
                  style={{ fontSize: 15, padding: '12px 28px' }}
                >
                  {page.bottom_cta_primary_label}
                </SmartLink>
              )}
              {page.bottom_cta_secondary_label && (
                <SmartLink
                  href={page.bottom_cta_secondary_href || '#'}
                  className="btn btn-ghost"
                  style={{ fontSize: 15, padding: '12px 28px' }}
                >
                  {page.bottom_cta_secondary_label}
                </SmartLink>
              )}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />

      {/* Mobile: stack the multi-column "How it works" steps */}
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

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  );
}

function SectionHeading({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h2
      style={{
        fontSize: 28,
        fontWeight: 800,
        letterSpacing: '-0.02em',
        margin: 0,
        marginBottom: 40,
        color: 'var(--text)',
        ...style,
      }}
    >
      {children}
    </h2>
  );
}

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
        <SmartLink
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
        </SmartLink>
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

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div
      className="app-faq"
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>{q}</div>
      <div style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.6 }}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => <SmartLink href={href || '#'} style={{ color: 'var(--neon)' }}>{children}</SmartLink>,
            p: ({ children }) => <p style={{ margin: 0 }}>{children}</p>,
          }}
        >
          {a}
        </ReactMarkdown>
      </div>
    </div>
  );
}

/**
 * SmartLink — picks <a target="_blank"> for absolute (http/https) URLs and
 * Next.js <Link> for internal paths. CMS authors don't need to think about
 * this; they just paste a URL or path.
 */
function SmartLink({
  href,
  children,
  className,
  style,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const isExternal = /^https?:\/\//i.test(href);
  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} style={style}>
      {children}
    </Link>
  );
}
