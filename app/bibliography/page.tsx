import Link from 'next/link';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCategories } from '@/lib/cms';
import type { Post, Source, Category } from '@/lib/supabase';

export const revalidate = 0;

export const metadata = {
  title: 'Bibliography',
  description:
    'Every source cited in Just Get Fit articles, grouped by category. Real research, real publications, real attribution.',
  alternates: { canonical: '/bibliography' },
};

/**
 * Public /bibliography page.
 *
 * Lists every source cited across all articles, grouped by category,
 * then by article within each category. Each source links out to its
 * URL; each article subheading links into the article so the reader
 * can see the claim it backs up.
 *
 * Categories with zero cited articles still render — empty-state copy
 * directs the reader to read the articles in that category. Same as a
 * traditional bibliography in a textbook: every chapter has a section,
 * even if some are sparse.
 *
 * Data fetch: pull all posts that have at least one source, plus the
 * canonical category list. We do this with supabaseAdmin so we don't
 * need an RLS rule for SELECT on posts.sources from the anon client.
 */

type PostWithSources = Pick<Post, 'id' | 'slug' | 'title' | 'category' | 'sources'>;

export default async function BibliographyPage() {
  const [{ data: postsData }, categories] = await Promise.all([
    supabaseAdmin
      .from('posts')
      .select('id, slug, title, category, sources')
      .not('sources', 'is', null)
      .order('published_at', { ascending: false }),
    getCategories(),
  ]);

  // Filter to posts that actually have sources (the .not('sources', 'is', null)
  // catches null but not empty arrays — those exist when a citation run
  // found nothing. We exclude those here.)
  const postsWithSources = ((postsData ?? []) as PostWithSources[]).filter(
    (p) => Array.isArray(p.sources) && p.sources.length > 0
  );

  // Bucket posts by category. Posts with a null/missing category go
  // into an "Uncategorized" bucket but we don't render that bucket in
  // the main flow — those are edge cases. The main flow iterates the
  // canonical category list so order matches the rest of the site.
  const postsByCategory = new Map<string, PostWithSources[]>();
  for (const p of postsWithSources) {
    const key = p.category ?? '__uncategorized';
    const list = postsByCategory.get(key);
    if (list) list.push(p);
    else postsByCategory.set(key, [p]);
  }

  // Pre-compute totals for the header summary.
  const totalSources = postsWithSources.reduce(
    (sum, p) => sum + (p.sources?.length ?? 0),
    0
  );
  const totalArticles = postsWithSources.length;

  return (
    <>
      <SiteNav />

      <main style={{ padding: '32px 24px 80px', maxWidth: 1080, margin: '0 auto' }}>
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Bibliography' }]} />

        <header style={{ marginBottom: 36 }}>
          <h1
            style={{
              fontSize: 'clamp(34px, 4.5vw, 48px)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              marginBottom: 14,
            }}
          >
            Bibliography
          </h1>
          <p
            style={{
              fontSize: 17,
              color: 'var(--text-2)',
              lineHeight: 1.55,
              maxWidth: 720,
              marginBottom: 8,
            }}
          >
            Every source cited in our articles, grouped by category. Real research, real publications, real attribution. We&rsquo;d rather cite something than make a claim we can&rsquo;t back up.
          </p>
          {totalSources > 0 && (
            <p
              style={{
                fontSize: 13,
                color: 'var(--text-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 600,
                marginTop: 16,
              }}
            >
              {totalSources.toLocaleString()} {totalSources === 1 ? 'source' : 'sources'} across{' '}
              {totalArticles.toLocaleString()} {totalArticles === 1 ? 'article' : 'articles'}
            </p>
          )}
        </header>

        {/* Category nav — quick-jump anchors so a long bibliography
            stays navigable. Rendered as pills, one per category. */}
        <nav
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 40,
            padding: 14,
            background: 'var(--bg-1)',
            border: '1px solid var(--line)',
            borderRadius: 12,
          }}
          aria-label="Bibliography categories"
        >
          {categories.map((c) => {
            const count = (postsByCategory.get(c.slug) ?? []).reduce(
              (sum, p) => sum + (p.sources?.length ?? 0),
              0
            );
            return (
              <a
                key={c.slug}
                href={`#cat-${c.slug}`}
                style={{
                  padding: '6px 12px',
                  borderRadius: 100,
                  border: '1px solid var(--line)',
                  fontSize: 13,
                  color: count > 0 ? 'var(--text-2)' : 'var(--text-3)',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--bg-2)',
                }}
              >
                <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{c.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
                  ({count})
                </span>
              </a>
            );
          })}
        </nav>

        {/* Per-category sections. All 8 (or however many active) render
            even when empty — empty ones get a "no sources cited yet"
            line that nudges the reader to read articles. */}
        {categories.map((c) => (
          <CategorySection
            key={c.slug}
            category={c}
            posts={postsByCategory.get(c.slug) ?? []}
          />
        ))}

        {/* Disclaimer at the bottom — what this list is and isn't */}
        <div
          style={{
            marginTop: 48,
            padding: 22,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--line)',
            fontSize: 13,
            color: 'var(--text-3)',
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: 'var(--text-2)' }}>About this bibliography.</strong> Sources are
          gathered automatically when an article is fact-checked, then verified (URL returns 200,
          page title roughly matches what the source claims to be). Sources that fail verification
          aren&rsquo;t included. If you spot a broken link or a source that&rsquo;s no longer at
          the URL we list, please <Link href="/contact" style={{ color: 'var(--neon)', textDecoration: 'underline', textDecorationColor: 'rgba(196,255,61,0.4)', textUnderlineOffset: 3 }}>let us know</Link>.
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

function CategorySection({
  category,
  posts,
}: {
  category: Category;
  posts: PostWithSources[];
}) {
  const totalSources = posts.reduce((sum, p) => sum + (p.sources?.length ?? 0), 0);

  return (
    <section
      id={`cat-${category.slug}`}
      style={{
        marginBottom: 56,
        // Anchor-jump scroll offset — keeps the heading visible below
        // a sticky nav rather than sliding under it.
        scrollMarginTop: 24,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 14,
          marginBottom: 8,
          paddingBottom: 12,
          borderBottom: '1px solid var(--line)',
          flexWrap: 'wrap',
        }}
      >
        <h2
          style={{
            fontSize: 'clamp(22px, 2.6vw, 28px)',
            fontWeight: 800,
            letterSpacing: '-0.01em',
            margin: 0,
            textTransform: 'capitalize',
          }}
        >
          {category.name}
        </h2>
        <span
          style={{
            fontSize: 12,
            color: 'var(--text-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 600,
          }}
        >
          {totalSources} {totalSources === 1 ? 'source' : 'sources'} ·{' '}
          {posts.length} {posts.length === 1 ? 'article' : 'articles'}
        </span>
      </header>

      {posts.length === 0 ? (
        <div
          style={{
            padding: '24px 0',
            color: 'var(--text-3)',
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          No sources cited yet in this category.{' '}
          <Link
            href={`/articles/${category.slug}`}
            style={{
              color: 'var(--neon)',
              textDecoration: 'underline',
              textDecorationColor: 'rgba(196,255,61,0.4)',
              textUnderlineOffset: 3,
            }}
          >
            Browse {category.name.toLowerCase()} articles →
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 22 }}>
          {posts.map((post) => (
            <ArticleSourceGroup key={post.id} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}

function ArticleSourceGroup({ post }: { post: PostWithSources }) {
  const sources = (post.sources ?? []) as Source[];
  const articleHref = post.category ? `/articles/${post.category}/${post.slug}` : '#';

  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px', letterSpacing: '-0.005em' }}>
        <Link
          href={articleHref}
          style={{
            color: 'var(--text)',
            textDecoration: 'none',
          }}
        >
          {post.title} →
        </Link>
      </h3>
      <ol
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {sources.map((s) => (
          <li
            key={`${post.id}-${s.n}`}
            style={{
              display: 'flex',
              gap: 10,
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--text-2)',
              paddingLeft: 12,
              borderLeft: '1px solid var(--line)',
            }}
          >
            <span
              style={{
                flexShrink: 0,
                fontWeight: 700,
                color: 'var(--neon)',
                minWidth: 28,
                fontFamily:
                  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              }}
            >
              [{s.n}]
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                style={{
                  color: 'var(--text)',
                  textDecoration: 'underline',
                  textDecorationColor: 'rgba(196,255,61,0.4)',
                  textUnderlineOffset: 3,
                  fontWeight: 500,
                }}
              >
                {s.title}
              </a>
              {s.publication && (
                <span style={{ color: 'var(--text-3)', marginLeft: 8, fontSize: 13 }}>
                  — {s.publication}
                </span>
              )}
              {s.quote && (
                <blockquote
                  style={{
                    margin: '6px 0 0 0',
                    padding: '4px 10px',
                    borderLeft: '2px solid rgba(196,255,61,0.4)',
                    fontStyle: 'italic',
                    fontSize: 13,
                    color: 'var(--text-2)',
                  }}
                >
                  &ldquo;{s.quote}&rdquo;
                </blockquote>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
