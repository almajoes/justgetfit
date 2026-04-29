import Link from 'next/link';

export const metadata = { title: 'Pages · Admin' };

const PAGES = [
  { slug: 'home-hero', name: 'Home Hero', desc: 'Headline, lede, CTAs, stats, hero background image.' },
  { slug: 'about', name: 'About Us', desc: 'Headline, tagline, body content, pillar cards, CTAs.' },
  { slug: 'subscribe', name: 'Subscribe', desc: 'Headline, lede, promise cards, FAQ entries.' },
  { slug: 'contact', name: 'Contact Us', desc: 'Headline, intro, form labels, success message.' },
];

export default function PagesIndex() {
  return (
    <div style={{ padding: 32, maxWidth: 1080, margin: '0 auto' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>Pages</h1>
      <p style={{ color: 'var(--text-2)', marginBottom: 32 }}>
        Edit static page content. Changes are live within ~60 seconds.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {PAGES.map((p) => (
          <Link
            key={p.slug}
            href={`/admin/pages/${p.slug}`}
            style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: 24,
              textDecoration: 'none',
              color: 'var(--text)',
              display: 'block',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{p.name}</div>
            <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>{p.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
