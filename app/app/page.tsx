import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { FaqAccordion } from '@/components/FaqAccordion';
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
 * Segment the /app page Markdown into a sequence of normal-markdown blocks
 * and FAQ-accordion blocks.
 *
 * Authoring syntax (in the admin /admin/pages/app Markdown textarea):
 *
 *   ## ::: faq
 *
 *   ## How does it work?
 *
 *   You answer a few questions and we build a plan…
 *
 *   ## What if I don't train on a day my plan says is a training day?
 *
 *   Switch today's meal day to a rest day…
 *
 *   ## :::
 *
 * `## ::: faq` opens an FAQ section; `## :::` closes it. Both sentinels
 * are H2 headings so the Markdown editor doesn't need anything special.
 * They are stripped from the output — only the H2 questions inside the
 * fence become accordion items, and everything between two question H2s
 * (or between the last question H2 and the closing sentinel) is the
 * answer body for the previous question.
 *
 * Returns an ordered array of segments. Markdown segments are joined and
 * rendered through ReactMarkdown; faq segments are rendered through
 * <FaqAccordion>. If the Markdown contains no `## ::: faq` fence, the
 * whole thing comes back as a single markdown segment.
 */
type AppSegment =
  | { type: 'markdown'; content: string }
  | { type: 'faq'; items: { question: string; answer: string }[] };

function parseAppMarkdown(src: string): AppSegment[] {
  const segments: AppSegment[] = [];
  const lines = src.split(/\r?\n/);
  // Sentinel detection — we match on the trimmed line so authors aren't
  // tripped up by trailing whitespace or accidental indentation.
  const isOpen = (line: string) => /^##\s+:::\s*faq\s*$/i.test(line.trim());
  const isClose = (line: string) => /^##\s+:::\s*$/.test(line.trim());

  let i = 0;
  let mdBuf: string[] = [];

  const flushMd = () => {
    const text = mdBuf.join('\n').replace(/^\n+|\n+$/g, '');
    if (text) segments.push({ type: 'markdown', content: text });
    mdBuf = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    if (isOpen(line)) {
      // Flush any markdown gathered so far, then collect FAQ body until
      // the matching close (or end of doc).
      flushMd();
      i++;
      const faqLines: string[] = [];
      while (i < lines.length && !isClose(lines[i])) {
        faqLines.push(lines[i]);
        i++;
      }
      // Skip the closing sentinel if present
      if (i < lines.length && isClose(lines[i])) i++;

      // Parse Q/A pairs out of the FAQ body. Each `##` heading starts a
      // new question; everything until the next `##` is the answer body.
      const items: { question: string; answer: string }[] = [];
      let current: { question: string; answerLines: string[] } | null = null;
      const h2Re = /^##\s+(.+)$/;
      for (const fl of faqLines) {
        const m = fl.match(h2Re);
        if (m) {
          if (current) {
            items.push({
              question: current.question,
              answer: current.answerLines.join('\n').replace(/^\n+|\n+$/g, ''),
            });
          }
          current = { question: m[1].trim(), answerLines: [] };
        } else if (current) {
          current.answerLines.push(fl);
        }
        // Lines before the first ## inside the FAQ block are dropped on
        // purpose — there's no question to attach them to. Authors can
        // put intro copy before the `## ::: faq` sentinel instead.
      }
      if (current) {
        items.push({
          question: current.question,
          answer: current.answerLines.join('\n').replace(/^\n+|\n+$/g, ''),
        });
      }

      if (items.length > 0) segments.push({ type: 'faq', items });
      continue;
    }
    mdBuf.push(line);
    i++;
  }
  flushMd();

  return segments;
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
  const segments = parseAppMarkdown(markdown);

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

        {/* Body — markdown segments and FAQ accordion blocks rendered in
            authoring order. The parser splits the source on `## ::: faq`
            / `## :::` sentinels; everything else is a normal markdown
            segment with the editorial styling defined below. */}
        {segments.length > 0 && (
          <article className="app-doc-body">
            {segments.map((seg, i) =>
              seg.type === 'faq' ? (
                <FaqAccordion key={i} items={seg.items} />
              ) : (
                <ReactMarkdown
                  key={i}
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
                  {seg.content}
                </ReactMarkdown>
              )
            )}
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

        /* FAQ accordion. The .app-doc-faq container sits where the FAQ
           block was authored in the markdown source (between the
           '## ::: faq' opening sentinel and '## :::' closing sentinel).
           Each item gets its own collapsed/open state managed by the
           client FaqAccordion component. */
        .app-doc-faq {
          margin: 24px 0 32px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .app-doc-faq-item {
          border: 1px solid var(--line);
          border-radius: 12px;
          overflow: hidden;
          background: var(--bg-1);
          transition: border-color 0.18s ease;
        }
        .app-doc-faq-item.is-open {
          border-color: rgba(196, 255, 61, 0.3);
        }
        .app-doc-faq-q {
          margin: 0;
          font-size: inherit;  /* button below sets its own size */
          font-weight: 400;
        }
        .app-doc-faq-button {
          width: 100%;
          background: transparent;
          border: 0;
          padding: 18px 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          cursor: pointer;
          color: var(--text);
          font-family: inherit;
          font-size: 16px;
          font-weight: 600;
          line-height: 1.45;
          text-align: left;
          letter-spacing: -0.005em;
        }
        .app-doc-faq-button:hover {
          color: var(--neon);
        }
        .app-doc-faq-button:focus-visible {
          outline: 2px solid var(--neon);
          outline-offset: -2px;
          border-radius: 12px;
        }
        .app-doc-faq-q-text {
          flex: 1;
          min-width: 0;
        }
        .app-doc-faq-chevron {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          background: rgba(196, 255, 61, 0.10);
          color: var(--neon);
          transition: transform 0.2s ease, background 0.2s ease;
        }
        .app-doc-faq-item.is-open .app-doc-faq-chevron {
          transform: rotate(180deg);
          background: rgba(196, 255, 61, 0.18);
        }
        .app-doc-faq-a {
          padding: 0 22px 18px;
          border-top: 1px solid var(--line);
          padding-top: 14px;
        }
        .app-doc-faq-a > :first-child { margin-top: 0; }
        .app-doc-faq-a > :last-child { margin-bottom: 0; }

        @media (max-width: 700px) {
          .app-doc { padding: 32px 20px 72px; }
          .app-doc-video { border-radius: 12px; margin-bottom: 40px; }
          .app-doc-h1 { font-size: 34px; }
          .app-doc-h2 { font-size: 24px; margin-top: 44px; }
          .app-doc-h1 + .app-doc-p { font-size: 17px; }
          .app-doc-faq-button { padding: 16px 18px; font-size: 15px; }
          .app-doc-faq-a { padding: 12px 18px 16px; }
        }
      `}</style>
    </>
  );
}
