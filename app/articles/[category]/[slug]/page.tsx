import { notFound } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '@/lib/supabase';
import type { Post } from '@/lib/supabase';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { getCategories } from '@/lib/cms';

export const revalidate = 0;

async function getPost(slug: string): Promise<Post | null> {
  const { data } = await supabase.from('posts').select('*').eq('slug', slug).maybeSingle();
  return (data as Post) ?? null;
}

async function getRelatedPosts(category: string | null, excludeSlug: string, limit = 3): Promise<Post[]> {
  if (!category) return [];
  const { data } = await supabase
    .from('posts')
    .select('*')
    .eq('category', category)
    .neq('slug', excludeSlug)
    .order('published_at', { ascending: false })
    .limit(limit);
  return (data as Post[]) || [];
}

async function getCategoryCounts() {
  const { data } = await supabase.from('posts').select('category');
  const counts: Record<string, number> = {};
  (data || []).forEach((row: { category: string | null }) => {
    if (!row.category) return;
    counts[row.category] = (counts[row.category] || 0) + 1;
  });
  return counts;
}

export async function generateMetadata({ params }: { params: { category: string; slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) return {};
  // Verify category matches — if not, no metadata (page will 404)
  if (post.category !== params.category) return {};
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://justgetfit.org';
  const ogImage = post.cover_image_url || `${SITE_URL}/og-image.png`;
  const url = `${SITE_URL}/articles/${post.category}/${post.slug}`;
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.excerpt ?? undefined,
      type: 'article',
      url,
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
      authors: ['Just Get Fit Editorial'],
      section: post.category ?? undefined,
      images: [{ url: ogImage, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt ?? undefined,
      images: [ogImage],
    },
  };
}

const CATEGORY_GRADIENTS: Record<string, string> = {
  strength:     'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  hypertrophy:  'linear-gradient(135deg, #5e2c8b 0%, #8e2de2 50%, #4a00e0 100%)',
  nutrition:    'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
  recovery:     'linear-gradient(135deg, #2c3e50 0%, #4ca1af 100%)',
  conditioning: 'linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)',
  mobility:     'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
  programming:  'linear-gradient(135deg, #232526 0%, #414345 100%)',
  mindset:      'linear-gradient(135deg, #2c1f5b 0%, #6b3aa0 50%, #a064d6 100%)',
};

export default async function ArticlePage({ params }: { params: { category: string; slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) notFound();
  // Verify category matches — prevents URL spoofing like /articles/strength/<nutrition-slug>
  if (post.category !== params.category) notFound();

  const [related, categories, counts] = await Promise.all([
    getRelatedPosts(post.category, post.slug, 3),
    getCategories(),
    getCategoryCounts(),
  ]);

  const formattedDate = new Date(post.published_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // JSON-LD Article schema — helps Google understand the content structure
  // and qualify for rich results (publication date, author, image)
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://justgetfit.org';
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    image: post.cover_image_url || `${SITE_URL}/og-image.png`,
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    author: {
      '@type': 'Organization',
      name: 'Just Get Fit Editorial',
      url: SITE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Just Get Fit',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/og-image.png`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/articles/${post.category}/${post.slug}`,
    },
    articleSection: post.category ?? undefined,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <SiteNav />

      <section className="page-with-sidebar">
        <div className="content-grid">
          <article className="content-main">
            <Breadcrumbs
              items={[
                { label: 'Articles', href: '/articles' },
                { label: post.category || 'Article', href: `/articles/${post.category}` },
                { label: post.title },
              ]}
            />
            <div
              style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                fontSize: 12,
                color: 'var(--text-3)',
                marginBottom: 24,
              }}
            >
              {post.category && (
                <>
                  <Link
                    href={`/articles/${post.category}`}
                    style={{ color: 'var(--neon)', textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}
                  >
                    {post.category}
                  </Link>
                  <span>·</span>
                </>
              )}
              <span>{formattedDate}</span>
              {post.read_minutes && (
                <>
                  <span>·</span>
                  <span>{post.read_minutes} min read</span>
                </>
              )}
              <span>·</span>
              <span>Just Get Fit Editorial</span>
            </div>

            <h1
              style={{
                fontSize: 'clamp(36px, 5vw, 56px)',
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: '-0.03em',
                marginBottom: 24,
              }}
            >
              {post.title}
            </h1>

            {post.excerpt && (
              <p style={{ fontSize: 21, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 40 }}>
                {post.excerpt}
              </p>
            )}

            {post.cover_image_url && (
              <figure style={{ margin: '0 0 40px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.cover_image_url}
                  alt={post.title}
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                    borderRadius: 12,
                  }}
                />
                {post.cover_image_credit && (
                  <figcaption style={{ marginTop: 10, fontSize: 12, fontStyle: 'italic', color: 'var(--text-3)' }}>
                    {post.cover_image_credit}
                  </figcaption>
                )}
              </figure>
            )}

            <div className="about-body" style={{ fontSize: 17, lineHeight: 1.75 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
            </div>

            <div
              style={{
                marginTop: 60,
                padding: 28,
                borderRadius: 16,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--line)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--neon)', marginBottom: 10 }}>
                Disclaimer
              </div>
              <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6 }}>
                This is fitness writing, not medical advice. Talk to a qualified doctor or coach
                before making significant changes to your training, diet, or supplementation —
                especially if you have a medical condition, are pregnant, or are recovering from injury.
              </p>
            </div>

            <div style={{ marginTop: 40 }}>
              <Link href="/articles" className="btn btn-ghost">
                ← Back to all articles
              </Link>
            </div>
          </article>

          <aside className="sidebar">
            {related.length > 0 && (
              <div className="sidebar-card">
                <h4>More in {post.category}</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {related.map((r) => (
                    <Link
                      key={r.id}
                      href={`/articles/${r.category}/${r.slug}`}
                      style={{ display: 'flex', flexDirection: 'column', gap: 8, textDecoration: 'none', color: 'var(--text)' }}
                    >
                      {r.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.cover_image_url}
                          alt=""
                          style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                            borderRadius: 8,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            aspectRatio: '16/9',
                            borderRadius: 8,
                            background:
                              CATEGORY_GRADIENTS[r.category?.toLowerCase() ?? ''] ||
                              CATEGORY_GRADIENTS.strength,
                          }}
                        />
                      )}
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            lineHeight: 1.35,
                            marginBottom: 4,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {r.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {r.read_minutes ? `${r.read_minutes} min` : ''}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="sidebar-card">
              <h4>Categories</h4>
              <ul className="sidebar-list">
                {categories.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/articles/${c.slug}`}
                      className={c.slug === post.category ? 'active' : ''}
                    >
                      {c.name} <span className="count">{counts[c.slug] || 0}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="sidebar-card sidebar-newsletter">
              <h4 style={{ color: 'var(--neon)' }}>Get every Monday article</h4>
              <p>Subscribe and get next Monday's article delivered to your inbox.</p>
              <form action="/api/subscribe" method="POST">
                <input name="email" type="email" placeholder="you@example.com" required />
                <input type="hidden" name="source" value="article-sidebar" />
                <button type="submit">Subscribe</button>
              </form>
            </div>
          </aside>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
