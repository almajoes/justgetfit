import Link from 'next/link';
import Image from 'next/image';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Author } from '@/lib/supabase';

export const revalidate = 0;

export const metadata = {
  title: 'Authors',
  description: 'Meet the writers behind Just Get Fit — coverage of strength training, nutrition, recovery, and the long game.',
  alternates: { canonical: '/authors' },
};

/**
 * Public /authors index. Lists every active author with photo, name,
 * bio, and post count. Each card links to /authors/<slug>.
 *
 * We fetch authors via supabaseAdmin (service role) here rather than
 * the public anon client so we don't have to set up RLS policies for
 * SELECT on public.authors. The service-role read is fine — there's
 * nothing private on the row.
 *
 * Post counts come from a single grouped query so we don't N+1 the
 * authors list. Authors with zero posts still appear (rare but
 * possible — a freshly added author who hasn't been assigned yet).
 */
export default async function AuthorsIndexPage() {
  const [{ data: authorsData }, { data: postCountRows }] = await Promise.all([
    supabaseAdmin
      .from('authors')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true }),
    // Aggregating by author_id at the SQL level requires a view or RPC.
    // Simpler: fetch all (author_id) tuples and tally in memory. With
    // ~50 posts that's negligible.
    supabaseAdmin.from('posts').select('author_id').not('author_id', 'is', null),
  ]);

  const authors = (authorsData ?? []) as Author[];
  const postCount: Record<string, number> = {};
  for (const row of (postCountRows ?? []) as { author_id: string | null }[]) {
    if (!row.author_id) continue;
    postCount[row.author_id] = (postCount[row.author_id] || 0) + 1;
  }

  return (
    <>
      <SiteNav />

      <main style={{ padding: '32px 24px 80px', maxWidth: 1080, margin: '0 auto' }}>
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Authors' }]} />

        <header style={{ marginBottom: 36 }}>
          <h1
            style={{
              fontSize: 'clamp(34px, 4.5vw, 48px)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              marginBottom: 12,
            }}
          >
            Authors
          </h1>
          <p
            style={{
              fontSize: 17,
              color: 'var(--text-2)',
              lineHeight: 1.55,
              maxWidth: 640,
            }}
          >
            The writers covering strength training, nutrition, recovery, and the long game on Just Get Fit. All articles are reviewed by Just Get Fit Editorial.
          </p>
        </header>

        {authors.length === 0 ? (
          <p style={{ color: 'var(--text-3)', fontSize: 14 }}>No authors yet.</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 18,
            }}
          >
            {authors.map((a) => (
              <AuthorCard key={a.id} author={a} postCount={postCount[a.id] || 0} />
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function AuthorCard({ author, postCount }: { author: Author; postCount: number }) {
  const initials = author.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <Link
      href={`/authors/${author.slug}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 14,
        textDecoration: 'none',
        color: 'inherit',
        overflow: 'hidden', // clips the photo to the rounded corners
        transition: 'border-color 0.15s, transform 0.15s',
      }}
    >
      {/* Photo block. Square (1:1) so the existing 400×400 uploads
          render edge-to-edge without cropping. The wrapper is the
          1:1-aspect frame; the actual <Image> fills it via absolute
          positioning + object-fit: cover so even slightly off-square
          uploads still look right. */}
      {author.photo_url ? (
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '1 / 1',
            background: 'var(--bg-2)',
          }}
        >
          <Image
            src={author.photo_url}
            alt={author.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1080px) 50vw, 33vw"
            style={{ objectFit: 'cover' }}
            unoptimized
          />
        </div>
      ) : (
        // Initial-monogram fallback — also square so all cards in the
        // grid keep the same height regardless of photo presence.
        <div
          aria-hidden
          style={{
            width: '100%',
            aspectRatio: '1 / 1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(196,255,61,0.06)',
            color: 'var(--neon)',
            fontWeight: 700,
            fontSize: 56,
            letterSpacing: '0.04em',
          }}
        >
          {initials || '·'}
        </div>
      )}

      {/* Text block: name + post count + bio. Padding only here so the
          photo sits flush to the card edges. */}
      <div style={{ padding: 18, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: author.bio ? 8 : 0,
          }}
        >
          <span style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            {author.name}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            {postCount} {postCount === 1 ? 'article' : 'articles'}
          </span>
        </div>
        {author.bio && (
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-2)',
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            {author.bio}
          </p>
        )}
      </div>
    </Link>
  );
}
