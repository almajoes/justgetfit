import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { PostCard } from '@/components/PostCard';
import { getCategoryBySlug, getCategories } from '@/lib/cms';
import { supabase } from '@/lib/supabase';
import type { Post } from '@/lib/supabase';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const cat = await getCategoryBySlug(params.slug);
  if (!cat) return { title: 'Category not found' };
  return {
    title: cat.name,
    description: cat.description || `Articles in ${cat.name}.`,
  };
}

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const cat = await getCategoryBySlug(params.slug);
  if (!cat) notFound();

  const [{ data: postsData }, allCats, { data: countsData }] = await Promise.all([
    supabase
      .from('posts')
      .select('*')
      .eq('category', params.slug)
      .order('published_at', { ascending: false }),
    getCategories(),
    supabase.from('posts').select('category'),
  ]);
  const posts = (postsData as Post[]) || [];

  const counts: Record<string, number> = {};
  (countsData || []).forEach((r: { category: string | null }) => {
    if (r.category) counts[r.category] = (counts[r.category] || 0) + 1;
  });
  const totalPosts = (countsData || []).length;

  return (
    <>
      <SiteNav />

      <section className="page-with-sidebar">
        <div className="content-grid">
          <div className="content-main">
            <div className="hero-pill" style={{ marginBottom: 24 }}>
              <span className="dot" />
              Category · {cat.name}
            </div>
            <h1 className="about-h1" style={{ marginBottom: 20 }}>
              <span className="accent">{cat.name}</span>
              <br />articles.
            </h1>
            <p style={{ fontSize: 18, color: 'var(--text-2)', marginBottom: 40, maxWidth: 640 }}>
              {posts.length} article{posts.length === 1 ? '' : 's'}.
              {cat.description && <> {cat.description}</>}
            </p>

            <div className="post-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {posts.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>

            {posts.length === 0 && (
              <p style={{ color: 'var(--text-3)', fontSize: 14, padding: '40px 0' }}>
                No articles in this category yet — check back soon.
              </p>
            )}
          </div>

          <aside className="sidebar">
            <div className="sidebar-card">
              <h4>Other categories</h4>
              <ul className="sidebar-list">
                <li>
                  <Link href="/articles">
                    All articles <span className="count">{totalPosts}</span>
                  </Link>
                </li>
                {allCats.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/category/${c.slug}`} className={c.slug === params.slug ? 'active' : ''}>
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
                <input type="hidden" name="source" value={`category-${params.slug}`} />
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
