import Link from 'next/link';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { PostCard } from '@/components/PostCard';
import { getHomeHero, getCategories } from '@/lib/cms';
import { supabase } from '@/lib/supabase';
import type { Post } from '@/lib/supabase';

export const revalidate = 0;

async function getRecentPosts(limit = 6): Promise<Post[]> {
  const { data } = await supabase
    .from('posts')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit);
  return (data as Post[]) || [];
}

async function getCategoryCounts(): Promise<Record<string, number>> {
  const { data } = await supabase.from('posts').select('category');
  const counts: Record<string, number> = {};
  (data || []).forEach((row: { category: string | null }) => {
    if (!row.category) return;
    counts[row.category] = (counts[row.category] || 0) + 1;
  });
  return counts;
}

async function getTotalPostCount(): Promise<number> {
  const { count } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true });
  return count || 0;
}

/**
 * Resolves stat tile values that reference live data.
 * Special tokens in the `num` field of a stat get replaced with real counts:
 *   - "auto:posts"      → total published post count
 *   - "auto:categories" → total active category count
 * Any other value is rendered as-is (just a fixed string).
 *
 * The `suffix` field is dropped for auto values (since the real count is exact).
 */
function resolveStat(
  stat: { num: string; suffix: string; label: string },
  postCount: number,
  categoryCount: number
): { num: string; suffix: string; label: string } {
  if (stat.num === 'auto:posts') {
    return { num: String(postCount), suffix: '', label: stat.label };
  }
  if (stat.num === 'auto:categories') {
    return { num: String(categoryCount), suffix: '', label: stat.label };
  }
  return stat;
}

export default async function HomePage() {
  const [hero, categories, posts, counts, totalPosts] = await Promise.all([
    getHomeHero(),
    getCategories(),
    getRecentPosts(6),
    getCategoryCounts(),
    getTotalPostCount(),
  ]);

  const resolvedStats = hero.stats.map((s) =>
    resolveStat(s, totalPosts, categories.length)
  );

  const heroBgStyle = hero.background_image_url
    ? { backgroundImage: `url('${hero.background_image_url}')` }
    : undefined;

  return (
    <>
      <SiteNav />

      <section className="hero">
        <div
          className={hero.background_image_url ? 'hero-bg has-image' : 'hero-bg'}
          style={heroBgStyle}
        />
        <div className="hero-overlay" />
        <div className="hero-content">
          <div className="hero-pill">
            <span className="dot" />
            {hero.pill_text}
          </div>
          <h1 className="hero-h">
            {hero.headline_part1}
            <br />
            <span className="accent">{hero.headline_accent}</span> {hero.headline_part2}
          </h1>
          <p className="lede">{hero.lede}</p>
          <div className="ctas">
            <Link href={hero.cta_primary.url} className="btn btn-primary">
              {hero.cta_primary.label}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link href={hero.cta_secondary.url} className="btn btn-ghost">
              {hero.cta_secondary.label}
            </Link>
          </div>
          <div className="hero-stats">
            {resolvedStats.map((s, i) => (
              <div className="stat-item" key={i}>
                <div className="stat-num">
                  {s.num}
                  {s.suffix && <span className="accent-num">{s.suffix}</span>}
                </div>
                <div className="stat-lbl">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cat-strip">
        <div className="cat-grid">
          {categories.map((c) => (
            <Link key={c.slug} href={`/category/${c.slug}`} className="cat-tile">
              <div className="cat-tile-icon">{c.icon}</div>
              <div className="cat-tile-name">{c.name}</div>
              <div className="cat-tile-count">
                {counts[c.slug] || 0} article{counts[c.slug] === 1 ? '' : 's'}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="posts-section">
        <div className="section-head">
          <h2>
            Recent <span className="accent">articles</span>
          </h2>
          <Link href="/articles" style={{ color: 'var(--text-2)', fontSize: 14, textDecoration: 'none' }}>
            View all →
          </Link>
        </div>
        <div className="post-grid">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
