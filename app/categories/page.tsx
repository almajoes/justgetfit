import Link from 'next/link';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { getCategories } from '@/lib/cms';
import { supabase } from '@/lib/supabase';

export const revalidate = 0;

export const metadata = {
  title: 'Categories',
  description: 'Browse Just Get Fit articles by category.',
};

export default async function CategoriesPage() {
  const categories = await getCategories();

  const { data: postRows } = await supabase.from('posts').select('category');
  const counts: Record<string, number> = {};
  (postRows || []).forEach((r: { category: string | null }) => {
    if (r.category) counts[r.category] = (counts[r.category] || 0) + 1;
  });

  return (
    <>
      <SiteNav />

      <section className="page-with-sidebar" style={{ maxWidth: 1280 }}>
        <div className="hero-pill" style={{ marginBottom: 24 }}>
          <span className="dot" />
          All categories
        </div>
        <h1 className="about-h1" style={{ marginBottom: 20 }}>
          Browse by <span className="accent">topic</span>.
        </h1>
        <p style={{ fontSize: 18, color: 'var(--text-2)', marginBottom: 40, maxWidth: 640 }}>
          Eight categories, rotating weekly. Pick one to dig in.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/category/${c.slug}`}
              style={{
                background: 'var(--bg-1)',
                border: '1px solid var(--line)',
                borderRadius: 16,
                padding: 24,
                textDecoration: 'none',
                color: 'var(--text)',
                display: 'block',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'rgba(196,255,61,0.12)',
                    color: 'var(--neon)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                  }}
                >
                  {c.icon}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{c.name}</div>
              </div>
              {c.description && (
                <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 12 }}>
                  {c.description}
                </p>
              )}
              <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {counts[c.slug] || 0} article{counts[c.slug] === 1 ? '' : 's'}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
