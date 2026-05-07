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

/**
 * Extract a YouTube video ID from any common URL shape:
 *   - https://www.youtube.com/watch?v=ID
 *   - https://youtu.be/ID
 *   - https://www.youtube.com/embed/ID
 *   - https://www.youtube.com/shorts/ID
 *   - https://www.youtube.com/live/ID
 *   - bare 11-char ID
 *
 * Returns null if no ID is found. We never trust the URL beyond extracting
 * the ID — the embed iframe is built from the ID alone, which prevents
 * smuggling extra query params (e.g. autoplay, JS API enables) through the
 * CMS field.
 */
function extractYouTubeId(input: string | undefined | null): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  // Bare ID (YouTube IDs are 11 chars, [A-Za-z0-9_-])
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  // Try parsing as URL
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      // /watch?v=ID
      const v = u.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      // /embed/ID, /shorts/ID, /live/ID, /v/ID
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch {
    // not a URL — fall through
  }
  // Last-ditch regex on the raw string for cases like share links with extra junk
  const m = s.match(/(?:v=|\/embed\/|\/shorts\/|\/live\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export const metadata = {
  title: 'The Just Get Fit App — Personalized Plans for Subscribers',
  description:
    'Personalized training, adaptive nutrition, progress tracking, and long-term accountability — all in one place. Free for Just Get Fit newsletter subscribers.',
  alternates: { canonical: '/app' },
  openGraph: {
    title: 'The Just Get Fit App',
    description:
      'A coaching system that evolves with you. Personalized training, adaptive nutrition, and progress tracking. Free for subscribers.',
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
 *
 * Feature section design choice (May 2026 update):
 *   The new content brief had ~10 distinct feature areas with capability
 *   bullet lists under each. To avoid the "double-bullet" anti-pattern
 *   (sub-bullets nested inside `desc` text), the page uses a richer
 *   `feature_groups` shape: each group is a card with a heading + short
 *   description + a SINGLE-LEVEL flat list of capability items. Cards are
 *   laid out in a 2-column grid on desktop, single column on mobile.
 *   The legacy `features[]` flat list is rendered only when no
 *   feature_groups are present.
 */
export default async function AppLandingPage() {
  const page = await getAppPage();
  const useFeatureGroups = (page.feature_groups || []).length > 0;
  const showPhilosophy =
    !!(page.philosophy_heading || (page.philosophy_avoid && page.philosophy_avoid.length) || (page.philosophy_focus && page.philosophy_focus.length));
  const heroVideoId = extractYouTubeId(page.hero_video_url);

  return (
    <>
      <SiteNav />
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '64px 24px 96px' }}>
        {/* Hero — uses the AppCTA "hero" variant for the centerpiece.
            Now CMS-managed via /admin/pages/app under the Hero/CTA section. */}
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <AppCTA variant="hero" content={page} />
        </div>

        {/* Optional YouTube video embed. Hidden when the CMS field is empty
            or the URL doesn't parse to a valid video ID. The iframe is
            built from the extracted ID only — we never pass the raw URL
            through, which prevents arbitrary query-param injection from
            the CMS field. */}
        {heroVideoId && (
          <section style={{ marginTop: 56, maxWidth: 920, marginLeft: 'auto', marginRight: 'auto' }}>
            <div className="app-hero-video">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${heroVideoId}?rel=0&modestbranding=1`}
                title="Just Get Fit App"
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          </section>
        )}

        {/* How it works — three short steps */}
        {page.steps && page.steps.length > 0 && (
          <section style={{ marginTop: 96, maxWidth: 920, marginLeft: 'auto', marginRight: 'auto' }}>
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

        {/* What you get — feature deep-dive.
            New design (May 2026): feature_groups render as a 2-col card grid
            with a single-level bullet list per card. Legacy `features` flat
            list still supported as fallback. */}
        {useFeatureGroups ? (
          <section style={{ marginTop: 96 }}>
            <div style={{ maxWidth: 920, marginLeft: 'auto', marginRight: 'auto' }}>
              <Eyebrow>{page.features_eyebrow}</Eyebrow>
              <SectionHeading>{page.features_heading}</SectionHeading>
            </div>

            <div className="app-feature-grid">
              {page.feature_groups!.map((g, i) => (
                <FeatureGroupCard key={i} icon={g.icon} title={g.title} desc={g.desc} items={g.items} />
              ))}
            </div>
          </section>
        ) : (
          page.features && page.features.length > 0 && (
            <section style={{ marginTop: 96, maxWidth: 920, marginLeft: 'auto', marginRight: 'auto' }}>
              <Eyebrow>{page.features_eyebrow}</Eyebrow>
              <SectionHeading>{page.features_heading}</SectionHeading>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {page.features.map((f, i) => (
                  <FeatureRow key={i} icon={f.icon} title={f.title} desc={f.desc} />
                ))}
              </div>
            </section>
          )
        )}

        {/* Philosophy / "designed around sustainability" closing block.
            Optional — hidden when no philosophy fields are set in CMS. */}
        {showPhilosophy && (
          <section style={{ marginTop: 96, maxWidth: 920, marginLeft: 'auto', marginRight: 'auto' }}>
            <PhilosophyBlock
              eyebrow={page.philosophy_eyebrow}
              heading={page.philosophy_heading}
              body={page.philosophy_body}
              avoid={page.philosophy_avoid}
              focus={page.philosophy_focus}
            />
          </section>
        )}

        {/* FAQ */}
        {page.faqs && page.faqs.length > 0 && (
          <section style={{ marginTop: 96, maxWidth: 920, marginLeft: 'auto', marginRight: 'auto' }}>
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
          <section style={{ marginTop: 96, textAlign: 'center', maxWidth: 920, marginLeft: 'auto', marginRight: 'auto' }}>
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

      {/* Page-scoped styles. Two-column feature grid collapses to single
          column on mobile. Steps grid also collapses. Custom bullet markers
          on feature lists use a small neon square — single level only,
          never nested (per content guideline). */}
      <style>{`
        .app-hero-video {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid var(--line);
          background: var(--bg-1);
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
        }
        .app-hero-video iframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          display: block;
        }

        .app-feature-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 20px;
        }
        .app-feature-card {
          background: linear-gradient(180deg, var(--bg-1) 0%, var(--bg-2) 100%);
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 28px 28px 24px;
          display: flex;
          flex-direction: column;
          transition: border-color 0.25s ease, transform 0.25s ease;
        }
        .app-feature-card:hover {
          border-color: var(--line-2);
          transform: translateY(-2px);
        }
        .app-feature-card .icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(196, 255, 61, 0.10);
          border: 1px solid rgba(196, 255, 61, 0.22);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          margin-bottom: 18px;
        }
        .app-feature-list {
          list-style: none;
          padding: 0;
          margin: 4px 0 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .app-feature-list li {
          position: relative;
          padding-left: 22px;
          font-size: 14.5px;
          line-height: 1.55;
          color: var(--text-2);
        }
        .app-feature-list li::before {
          content: '';
          position: absolute;
          left: 0;
          top: 9px;
          width: 8px;
          height: 8px;
          border-radius: 2px;
          background: var(--neon);
          box-shadow: 0 0 0 3px rgba(196, 255, 61, 0.12);
        }

        .app-philosophy {
          background:
            radial-gradient(120% 140% at 0% 0%, rgba(196,255,61,0.06) 0%, rgba(196,255,61,0) 55%),
            linear-gradient(180deg, var(--bg-1) 0%, var(--bg-2) 100%);
          border: 1px solid var(--line);
          border-radius: 24px;
          padding: 48px 40px;
        }
        .app-philosophy-cols {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 32px;
          margin-top: 28px;
        }
        .app-philosophy-col h4 {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-3);
          margin: 0 0 14px;
        }
        .app-philosophy-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .app-philosophy-list li {
          position: relative;
          padding-left: 22px;
          font-size: 15px;
          line-height: 1.55;
          color: var(--text);
        }
        .app-philosophy-list.avoid li::before {
          content: '';
          position: absolute;
          left: 2px;
          top: 11px;
          width: 12px;
          height: 1.5px;
          background: rgba(244, 244, 246, 0.4);
        }
        .app-philosophy-list.focus li::before {
          content: '';
          position: absolute;
          left: 0;
          top: 9px;
          width: 8px;
          height: 8px;
          border-radius: 2px;
          background: var(--neon);
          box-shadow: 0 0 0 3px rgba(196, 255, 61, 0.12);
        }

        @media (max-width: 900px) {
          .app-hero-video { border-radius: 14px; }
          .app-feature-grid { grid-template-columns: 1fr; gap: 16px; }
          .app-feature-card { padding: 24px 22px 22px; border-radius: 16px; }
          .app-philosophy { padding: 36px 24px; border-radius: 20px; }
          .app-philosophy-cols { grid-template-columns: 1fr; gap: 24px; margin-top: 20px; }
        }
        @media (max-width: 640px) {
          .app-steps { grid-template-columns: 1fr !important; }
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
        fontSize: 32,
        fontWeight: 800,
        letterSpacing: '-0.02em',
        margin: 0,
        marginBottom: 36,
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

/**
 * FeatureGroupCard — the new card design for /app. Renders an icon + title
 * + short description, then a SINGLE-LEVEL bullet list. Never render nested
 * lists here — the whole point of feature_groups is to flatten the content
 * model so authors can't accidentally produce double-indented bullets.
 */
function FeatureGroupCard({
  icon,
  title,
  desc,
  items,
}: {
  icon: string;
  title: string;
  desc: string;
  items: string[];
}) {
  return (
    <div className="app-feature-card">
      <div className="icon-wrap" aria-hidden>
        {icon}
      </div>
      <h3
        style={{
          fontSize: 19,
          fontWeight: 700,
          margin: 0,
          marginBottom: 10,
          color: 'var(--text)',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h3>
      {desc && (
        <p
          style={{
            fontSize: 15,
            color: 'var(--text-2)',
            lineHeight: 1.6,
            margin: 0,
            marginBottom: items && items.length > 0 ? 18 : 0,
          }}
        >
          {desc}
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="app-feature-list">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Legacy single-line feature row — kept so older CMS content still renders
 * if `feature_groups` is empty.
 */
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

function PhilosophyBlock({
  eyebrow,
  heading,
  body,
  avoid,
  focus,
}: {
  eyebrow?: string;
  heading?: string;
  body?: string;
  avoid?: string[];
  focus?: string[];
}) {
  return (
    <div className="app-philosophy">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {heading && (
        <h2
          style={{
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            margin: 0,
            marginBottom: body ? 14 : 0,
            color: 'var(--text)',
          }}
        >
          {heading}
        </h2>
      )}
      {body && (
        <p
          style={{
            fontSize: 16,
            color: 'var(--text-2)',
            lineHeight: 1.6,
            margin: 0,
            maxWidth: 680,
          }}
        >
          {body}
        </p>
      )}
      {((avoid && avoid.length) || (focus && focus.length)) && (
        <div className="app-philosophy-cols">
          {avoid && avoid.length > 0 && (
            <div className="app-philosophy-col">
              <h4>What we avoid</h4>
              <ul className="app-philosophy-list avoid">
                {avoid.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            </div>
          )}
          {focus && focus.length > 0 && (
            <div className="app-philosophy-col">
              <h4>What we focus on</h4>
              <ul className="app-philosophy-list focus">
                {focus.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
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
