import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { PostCard } from '@/components/PostCard';
import { Pagination } from '@/components/Pagination';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { getCategoryBySlug, getCategories } from '@/lib/cms';
import { supabase } from '@/lib/supabase';
import type { Post } from '@/lib/supabase';

export const revalidate = 0;

const PAGE_SIZE = 16;

export async function generateMetadata({ params }: { params: { category: string } }) {
  const cat = await getCategoryBySlug(params.category);
  if (!cat) return { title: 'Category not found' };
  return {
    title: cat.name,
    description: cat.description || `Articles in ${cat.name}.`,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: { category: string };
  searchParams: { page?: string };
}) {
  const cat = await getCategoryBySlug(params.category);
  if (!cat) notFound();

  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [{ data: postsData, count: totalCount }, allCats, { data: countsData }] = await Promise.all([
    supabase
      .from('posts')
      .select('*', { count: 'exact' })
      .eq('category', params.category)
      .order('published_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1),
    getCategories(),
    supabase.from('posts').select('category'),
  ]);
  const posts = (postsData as Post[]) || [];
  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
            <Breadcrumbs
              items={[
                { label: 'Articles', href: '/articles' },
                { label: cat.name },
              ]}
            />
            <div className="hero-pill" style={{ marginBottom: 24 }}>
              <span className="dot" />
              Category · {cat.name}
            </div>
            <h1 className="about-h1" style={{ marginBottom: 20 }}>
              <span className="accent">{cat.name}</span>
              <br />articles.
            </h1>
            <p style={{ fontSize: 18, color: 'var(--text-2)', marginBottom: 40, maxWidth: 640 }}>
              {total} article{total === 1 ? '' : 's'}{
                totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ''
              }.
              {cat.description && <> {cat.description}</>}
            </p>

            {posts.length > 0 ? (
              <>
                <div className="post-grid post-grid-2col">
                  {posts.map((p) => (
                    <PostCard key={p.id} post={p} />
                  ))}
                </div>
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  basePath={`/articles/${params.category}`}
                />
              </>
            ) : (
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
                    <Link href={`/articles/${c.slug}`} className={c.slug === params.category ? 'active' : ''}>
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
                <input type="hidden" name="source" value={`category-${params.category}`} />
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
