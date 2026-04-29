import { notFound } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '@/lib/supabase';
import type { Post } from '@/lib/supabase';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { getCategories } from '@/lib/cms';

export const revalidate = 60;

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

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    openGraph: {
      title: post.title,
      description: post.excerpt ?? undefined,
      type: 'article',
      publishedTime: post.published_at,
      images: post.cover_image_url ? [post.cover_image_url] : [],
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

export default async function ArticlePage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) notFound();

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

  const heroBg: React.CSSProperties = post.cover_image_url
    ? {
        backgroundImage: `url('${post.cover_image_url}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : {
        background:
          CATEGORY_GRADIENTS[post.category?.toLowerCase() ?? ''] ||
          CATEGORY_GRADIENTS.strength,
      };

  return (
    <>
      <SiteNav />

      <div
        style={{
          position: 'relative',
          aspectRatio: '32/9',
          maxHeight: 380,
          width: '100%',
          overflow: 'hidden',
          ...heroBg,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, transparent 50%, rgba(5,5,7,0.9) 100%)',
          }}
        />
      </div>

      <section className="page-with-sidebar">
        <div className="content-grid">
          <article className="content-main">
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
                    href={`/category/${post.category}`}
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

            <div className="about-body" style={{ fontSize: 17, lineHeight: 1.75 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
            </div>

            {post.cover_image_credit && (
              <p style={{ marginTop: 32, fontSize: 12, fontStyle: 'italic', color: 'var(--text-3)' }}>
                {post.cover_image_credit}
              </p>
            )}

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
                      href={`/articles/${r.slug}`}
                      style={{ display: 'flex', gap: 10, textDecoration: 'none', color: 'var(--text)' }}
                    >
                      <div
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 8,
                          flexShrink: 0,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          background: r.cover_image_url
                            ? `url('${r.cover_image_url}')`
                            : CATEGORY_GRADIENTS[r.category?.toLowerCase() ?? ''] || CATEGORY_GRADIENTS.strength,
                        }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
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
                      href={`/category/${c.slug}`}
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
