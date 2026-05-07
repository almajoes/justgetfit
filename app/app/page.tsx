import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { getAppPage } from '@/lib/cms';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
 * Layout (May 2026): single-column editorial document. Content is a
 * single Markdown blob in `page_markdown`, edited as one big textarea
 * in /admin/pages/app. Order on the page:
 *   1. Optional YouTube video at the very top (CMS: hero_video_url)
 *   2. Markdown body — H1, H2, H3, paragraphs, bullet lists
 *
 * No cards, no multi-column grids, no FAQ block, no marketing CTA cards
 * on this page. The renderer flattens nested lists to single-level by
 * design — the editorial style only allows one level of bullets.
 */
export default async function AppLandingPage() {
  const page = await getAppPage();
  const heroVideoId = extractYouTubeId(page.hero_video_url);
  const markdown = (page.page_markdown || '').trim();

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
              title="Just Get Fit App"
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        )}

        {/* Markdown body. We override the default element components so
            paragraphs, headings, and list items pick up the editorial
            styling defined below. Nested <ul>/<ol> are intentionally
            flattened — the renderer hands every <li> the same single-level
            class regardless of nesting depth. */}
        {markdown && (
          <article className="app-doc-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 className="app-doc-h1">{children}</h1>,
                h2: ({ children }) => <h2 className="app-doc-h2">{children}</h2>,
                h3: ({ children }) => <h3 className="app-doc-h3">{children}</h3>,
                h4: ({ children }) => <h4 className="app-doc-h3">{children}</h4>,
                p: ({ children }) => <p className="app-doc-p">{children}</p>,
                ul: ({ children }) => <ul className="app-doc-list">{children}</ul>,
                ol: ({ children }) => <ol className="app-doc-list app-doc-list-numbered">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                a: ({ href, children }) => (
                  <a
                    href={href || '#'}
                    target={href && /^https?:\/\//i.test(href) ? '_blank' : undefined}
                    rel={href && /^https?:\/\//i.test(href) ? 'noopener noreferrer' : undefined}
                    className="app-doc-a"
                  >
                    {children}
                  </a>
                ),
                strong: ({ children }) => <strong style={{ color: 'var(--text)', fontWeight: 700 }}>{children}</strong>,
              }}
            >
              {markdown}
            </ReactMarkdown>
          </article>
        )}
      </main>

      <SiteFooter />

      {/* Page-scoped styles — single column, generous editorial spacing.
          No cards, no grids. Lists use a single-level neon-square marker.
          The :where(.app-doc-list .app-doc-list) rule below kills nested
          list indentation by displaying nested lists inline as if they
          were at top level (they shouldn't be authored, but if they are,
          they degrade gracefully). */}
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
        .app-doc-body :first-child { margin-top: 0; }
        .app-doc-h1 {
          font-size: 44px;
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.1;
          margin: 0 0 24px;
          color: var(--text);
        }
        .app-doc-h2 {
          font-size: 30px;
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.2;
          margin: 56px 0 16px;
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
          margin: 0 0 16px;
        }
        /* H1's lead paragraph reads slightly larger */
        .app-doc-h1 + .app-doc-p {
          font-size: 18px;
          line-height: 1.65;
          margin-bottom: 18px;
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
        /* Nested lists: flatten visually — no extra indentation, no
           different marker. Single-level rendering is intentional. */
        .app-doc-list .app-doc-list {
          margin: 8px 0 0;
        }
        /* Numbered lists override the square marker with a neon counter */
        .app-doc-list-numbered {
          counter-reset: app-doc-counter;
        }
        .app-doc-list-numbered > li {
          counter-increment: app-doc-counter;
          padding-left: 32px;
        }
        .app-doc-list-numbered > li::before {
          content: counter(app-doc-counter) ".";
          background: transparent;
          box-shadow: none;
          width: auto;
          height: auto;
          border-radius: 0;
          top: 0;
          left: 0;
          font-weight: 700;
          color: var(--neon);
          font-size: 15px;
          line-height: 1.6;
        }
        .app-doc-a {
          color: var(--neon);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .app-doc-a:hover {
          text-decoration-thickness: 2px;
        }

        @media (max-width: 700px) {
          .app-doc { padding: 32px 20px 72px; }
          .app-doc-video { border-radius: 12px; margin-bottom: 40px; }
          .app-doc-h1 { font-size: 34px; }
          .app-doc-h2 { font-size: 24px; margin-top: 44px; }
          .app-doc-h1 + .app-doc-p { font-size: 17px; }
        }
      `}</style>
    </>
  );
}
