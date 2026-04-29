import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Post } from '@/lib/supabase';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { PostCard } from '@/components/PostCard';
import { getCategories } from '@/lib/cms';

export const revalidate = 60;
export const metadata = { title: 'Articles' };

async function getPosts(): Promise<Post[]> {
  const { data } = await supabase.from('posts').select('*').order('published_at', { ascending: false });
  return (data ?? []) as Post[];
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

export default async function ArticlesPage() {
  const [posts, categories, counts] = await Promise.all([getPosts(), getCategories(), getCategoryCounts()]);

  return (
    <>
      <SiteNav />

      <section className="page-with-sidebar">
        <div className="content-grid">
          <div className="content-main">
            <div className="hero-pill" style={{ marginBottom: 24 }}>
              <span className="dot" />
              Articles archive
            </div>
            <h1 className="about-h1" style={{ marginBottom: 20 }}>
              Every <span className="accent">article</span>,<br />newest first.
            </h1>
            <p style={{ fontSize: 18, color: 'var(--text-2)', marginBottom: 40, maxWidth: 640 }}>
              {posts.length === 0
                ? 'The first article ships soon.'
                : `${posts.length} article${posts.length === 1 ? '' : 's'} published. New post every Monday.`}
            </p>

            {posts.length > 0 ? (
              <div className="post-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                {posts.map((p) => (
                  <PostCard key={p.id} post={p} />
                ))}
              </div>
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
                    All articles <span className="count">{posts.length}</span>
                  </Link>
                </li>
                {categories.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/category/${c.slug}`}>
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
