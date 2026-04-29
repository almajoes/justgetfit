import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { getAboutPage, getCategories } from '@/lib/cms';
import { supabase } from '@/lib/supabase';

export const revalidate = 60;

export const metadata = {
  title: 'About Us',
  description: 'About Just Get Fit — evidence-based fitness writing.',
};

async function getCategoryCounts(): Promise<Record<string, number>> {
  const { data } = await supabase.from('posts').select('category');
  const counts: Record<string, number> = {};
  (data || []).forEach((row: { category: string | null }) => {
    if (!row.category) return;
    counts[row.category] = (counts[row.category] || 0) + 1;
  });
  return counts;
}

export default async function AboutPage() {
  const [page, categories, counts] = await Promise.all([
    getAboutPage(),
    getCategories(),
    getCategoryCounts(),
  ]);

  return (
    <>
      <SiteNav />

      <section className="page-with-sidebar">
        <div className="content-grid">
          <div className="content-main">
            <div className="hero-pill" style={{ marginBottom: 24 }}>
              <span className="dot" />
              {page.pill_text}
            </div>
            <h1 className="about-h1">
              {page.headline_part1} <span className="accent">{page.headline_accent}</span>{' '}
              {page.headline_part2}
            </h1>
            <p className="about-tagline">{page.tagline}</p>

            <div className="about-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{page.body_markdown}</ReactMarkdown>

              {page.pillars.length > 0 && (
                <div className="pillar-grid">
                  {page.pillars.map((p, i) => (
                    <div className="pillar" key={i}>
                      <div className="pillar-num">{p.num}</div>
                      <div className="pillar-title">{p.title}</div>
                      <div className="pillar-desc">{p.desc}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 36, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link href={page.cta_primary.url} className="btn btn-primary">
                  {page.cta_primary.label}
                </Link>
                <Link href={page.cta_secondary.url} className="btn btn-ghost">
                  {page.cta_secondary.label}
                </Link>
              </div>
            </div>
          </div>

          <aside className="sidebar">
            <div className="sidebar-card">
              <h4>Categories</h4>
              <ul className="sidebar-list">
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
              <h4 style={{ color: 'var(--neon)' }}>Get every Monday article</h4>
              <p>One article in your inbox every Monday morning. No spam, ever.</p>
              <form action="/api/subscribe" method="POST">
                <input name="email" type="email" placeholder="you@example.com" required />
                <input type="hidden" name="source" value="about-sidebar" />
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
