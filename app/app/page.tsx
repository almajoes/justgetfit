import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { getAppPage } from '@/lib/cms';

// Refresh hourly — content is admin-edited via /admin/pages/app and the
// admin save flow calls revalidatePath('/app') so changes also propagate
// immediately on save without waiting for the hour.
export const revalidate = 3600;

export const metadata = {
  title: 'The Just Get Fit App — Features Overview',
  description:
    'JustGetFit combines intelligent training, adaptive nutrition, progress tracking, and long-term accountability into one unified fitness platform. Free for newsletter subscribers.',
  alternates: { canonical: '/app' },
  openGraph: {
    title: 'The Just Get Fit App — Features Overview',
    description:
      'A coaching system that evolves with you. Personalized training, adaptive nutrition, and progress tracking. Free for subscribers.',
    type: 'website',
  },
};

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
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = u.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch {
    // not a URL — fall through
  }
  const m = s.match(/(?:v=|\/embed\/|\/shorts\/|\/live\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/**
 * /app — Just Get Fit app features page.
 *
 * Layout (May 2026 redesign): single-column editorial document. The
 * structure mirrors the source brief verbatim:
 *   1. Optional YouTube video at the very top (CMS field hero_video_url)
 *   2. H1 page title (page_title)
 *   3. Lead paragraph (page_intro)
 *   4. A flat sequence of sections (doc_sections), each with:
 *        - H2 title
 *        - optional intro paragraph(s) — \n\n splits paragraphs
 *        - optional subsections (H3 + intro + flat bullet list)
 *
 * No cards, no multi-column grids, no FAQ block, no marketing CTA cards
 * on this page. All copy is pulled from `getAppPage()` which deep-merges
 * defaults (lib/cms.ts APP_DEFAULT) over the DB row, so missing fields
 * fall back to the verbatim doc copy.
 */
export default async function AppLandingPage() {
  const page = await getAppPage();
  const heroVideoId = extractYouTubeId(page.hero_video_url);
  const sections = page.doc_sections || [];

  return (
    <>
      <SiteNav />

      <main className="app-doc">
        {/* Video at the very top — full-width inside the content column.
            Built from extracted video ID only (never the raw URL) so
            arbitrary query params can't be smuggled through the CMS. */}
        {heroVideoId && (
          <div className="app-doc-video">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${heroVideoId}?rel=0&modestbranding=1`}
              title={page.page_title || 'Just Get Fit App'}
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        )}

        {/* Page title (H1) */}
        {page.page_title && (
          <h1 className="app-doc-h1">{page.page_title}</h1>
        )}

        {/* Lead paragraph(s) — \n\n splits into separate <p> tags */}
        {page.page_intro &&
          page.page_intro.split(/\n\n+/).map((para, i) => (
            <p key={i} className="app-doc-lede">
              {para}
            </p>
          ))}

        {/* Sections */}
        {sections.map((section, si) => (
          <section key={si} className="app-doc-section">
            {section.title && <h2 className="app-doc-h2">{section.title}</h2>}
            {section.intro &&
              section.intro.split(/\n\n+/).map((para, i) => (
                <p key={i} className="app-doc-p">
                  {para}
                </p>
              ))}

            {section.subsections &&
              section.subsections.map((sub, ssi) => (
                <div key={ssi} className="app-doc-subsection">
                  {sub.title && <h3 className="app-doc-h3">{sub.title}</h3>}
                  {sub.intro &&
                    sub.intro.split(/\n\n+/).map((para, i) => (
                      <p key={i} className="app-doc-p">
                        {para}
                      </p>
                    ))}
                  {sub.items && sub.items.length > 0 && (
                    <ul className="app-doc-list">
                      {sub.items.map((it, i) => (
                        <li key={i}>{it}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
          </section>
        ))}
      </main>

      <SiteFooter />

      {/* Page-scoped styles — single column, generous editorial spacing.
          No cards, no grids. Lists use a single-level neon-square marker
          (single level only by design — the data shape can't express
          nested lists, which is what the user explicitly didn't want). */}
      <style>{`
        .app-doc {
          max-width: 760px;
          margin: 0 auto;
          padding: 48px 24px 96px;
          color: var(--text);
        }
        .app-doc-video {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid var(--line);
          background: var(--bg-1);
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
          margin-bottom: 56px;
        }
        .app-doc-video iframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          display: block;
        }
        .app-doc-h1 {
          font-size: 44px;
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.1;
          margin: 0 0 24px;
          color: var(--text);
        }
        .app-doc-lede {
          font-size: 18px;
          line-height: 1.65;
          color: var(--text-2);
          margin: 0 0 18px;
        }
        .app-doc-lede:last-of-type {
          margin-bottom: 8px;
        }
        .app-doc-section {
          margin-top: 56px;
        }
        .app-doc-h2 {
          font-size: 30px;
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.2;
          margin: 0 0 16px;
          color: var(--text);
          padding-bottom: 12px;
          border-bottom: 1px solid var(--line);
        }
        .app-doc-h3 {
          font-size: 17px;
          font-weight: 700;
          letter-spacing: -0.005em;
          margin: 28px 0 10px;
          color: var(--text);
        }
        .app-doc-p {
          font-size: 16px;
          line-height: 1.7;
          color: var(--text-2);
          margin: 0 0 14px;
        }
        .app-doc-subsection {
          margin-top: 8px;
        }
        .app-doc-list {
          list-style: none;
          padding: 0;
          margin: 8px 0 18px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .app-doc-list li {
          position: relative;
          padding-left: 22px;
          font-size: 16px;
          line-height: 1.6;
          color: var(--text);
        }
        .app-doc-list li::before {
          content: '';
          position: absolute;
          left: 0;
          top: 10px;
          width: 7px;
          height: 7px;
          border-radius: 2px;
          background: var(--neon);
          box-shadow: 0 0 0 3px rgba(196, 255, 61, 0.12);
        }

        @media (max-width: 700px) {
          .app-doc { padding: 32px 20px 72px; }
          .app-doc-video { border-radius: 12px; margin-bottom: 40px; }
          .app-doc-h1 { font-size: 34px; }
          .app-doc-h2 { font-size: 24px; }
          .app-doc-section { margin-top: 44px; }
          .app-doc-lede { font-size: 17px; }
        }
      `}</style>
    </>
  );
}
