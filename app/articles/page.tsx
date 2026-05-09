import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Post } from '@/lib/supabase';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { PostCard } from '@/components/PostCard';
import { Pagination } from '@/components/Pagination';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { getCategories } from '@/lib/cms';

export const revalidate = 0;
export const metadata = { title: 'Articles' };

const PAGE_SIZE = 16;

async function getCategoryCounts() {
  const { data } = await supabase.from('posts').select('category');
  const counts: Record<string, number> = {};
  (data || []).forEach((row: { category: string | null }) => {
    if (!row.category) return;
    counts[row.category] = (counts[row.category] || 0) + 1;
  });
  return counts;
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [{ data: posts, count: totalCount }, categories, counts] = await Promise.all([
    supabase
      .from('posts')
      .select('*', { count: 'exact' })
      .order('published_at', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1),
    getCategories(),
    getCategoryCounts(),
  ]);

  const allPosts = (posts ?? []) as Post[];
  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <SiteNav />

      <section className="page-with-sidebar">
        <div className="content-grid">
          <div className="content-main">
            <Breadcrumbs
              items={[
                { label: 'Home', href: '/' },
                { label: 'Articles' },
              ]}
            />
            <div className="hero-pill" style={{ marginBottom: 24 }}>
              <span className="dot" />
              Articles archive
            </div>
            <h1 className="about-h1" style={{ marginBottom: 20 }}>
              Every <span className="accent">article</span>,<br />newest first.
            </h1>
            <p style={{ fontSize: 18, color: 'var(--text-2)', marginBottom: 40, maxWidth: 640 }}>
              {total === 0
                ? 'The first article ships soon.'
                : `${total} article${total === 1 ? '' : 's'} published${
                    totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ''
                  }. New articles twice a week.`}
            </p>

            {allPosts.length > 0 ? (
              <>
                <div className="post-grid post-grid-2col">
                  {allPosts.map((p) => (
                    <PostCard key={p.id} post={p} />
                  ))}
                </div>
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  basePath="/articles"
                />
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-3)' }}>
                Nothing here yet.
              </div>
            )}
          </div>

          <aside className="sidebar">
            <div className="sidebar-card">
              <h4>Filter by category</h4>
              <ul className="sidebar-list">
                <li>
                  <Link href="/articles" className="active">
                    All articles <span className="count">{total}</span>
                  </Link>
                </li>
                {categories.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/articles/${c.slug}`}>
                      {c.name} <span className="count">{counts[c.slug] || 0}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="sidebar-card sidebar-newsletter">
              <h4 style={{ color: 'var(--neon)' }}>Twice a week, in your inbox</h4>
              <p>Subscribe and get every new article delivered straight to your inbox.</p>
              <form action="/api/subscribe" method="POST">
                <input name="email" type="email" placeholder="you@example.com" required />
                <input type="hidden" name="source" value="articles-sidebar" />
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
