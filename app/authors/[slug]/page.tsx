import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { PostCard } from '@/components/PostCard';
import { Pagination } from '@/components/Pagination';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Author, Post } from '@/lib/supabase';

export const revalidate = 0;

const PAGE_SIZE = 12;

/**
 * Public /authors/<slug> author detail page. Shows the full bio + a
 * paginated grid of every post they've written.
 *
 * Inactive authors are still reachable here — the rotation hides them
 * from the index but their existing posts (and historical bylines on
 * those posts) keep working. We just don't list them on /authors.
 */

async function getAuthor(slug: string): Promise<Author | null> {
  const { data } = await supabaseAdmin
    .from('authors')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  return (data as Author | null) ?? null;
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const author = await getAuthor(params.slug);
  if (!author) return {};
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://justgetfit.org';
  return {
    title: `${author.name} — Just Get Fit`,
    description: author.bio || `Articles by ${author.name} on Just Get Fit.`,
    alternates: { canonical: `/authors/${author.slug}` },
    openGraph: {
      title: `${author.name} — Just Get Fit`,
      description: author.bio || `Articles by ${author.name}.`,
      type: 'profile',
      url: `${SITE_URL}/authors/${author.slug}`,
      images: author.photo_url ? [{ url: author.photo_url, alt: author.name }] : undefined,
    },
  };
}

export default async function AuthorDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { page?: string };
}) {
  const author = await getAuthor(params.slug);
  if (!author) notFound();

  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { data: posts, count: totalCount } = await supabaseAdmin
    .from('posts')
    .select('*', { count: 'exact' })
    .eq('author_id', author.id)
    .order('published_at', { ascending: false })
    .order('id', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  const allPosts = (posts ?? []) as Post[];
  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const initials = author.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <>
      <SiteNav />

      <main style={{ padding: '32px 24px 80px', maxWidth: 1080, margin: '0 auto' }}>
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Authors', href: '/authors' },
            { label: author.name },
          ]}
        />

        {/* Author header — large photo, name, bio. */}
        <header
          style={{
            display: 'flex',
            gap: 22,
            alignItems: 'flex-start',
            margin: '24px 0 36px',
            flexWrap: 'wrap',
          }}
        >
          {author.photo_url ? (
            <Image
              src={author.photo_url}
              alt={author.name}
              width={120}
              height={120}
              style={{
                width: 120,
                height: 120,
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0,
                border: '1px solid var(--line)',
              }}
              unoptimized
            />
          ) : (
            <span
              aria-hidden
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 120,
                height: 120,
                borderRadius: '50%',
                background: 'rgba(196,255,61,0.12)',
                color: 'var(--neon)',
                fontWeight: 700,
                fontSize: 36,
                flexShrink: 0,
                border: '1px solid rgba(196,255,61,0.25)',
              }}
            >
              {initials || '·'}
            </span>
          )}

          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <h1
              style={{
                fontSize: 'clamp(30px, 4vw, 42px)',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                marginBottom: 10,
              }}
            >
              {author.name}
            </h1>
            {author.bio && (
              <p
                style={{
                  fontSize: 17,
                  color: 'var(--text-2)',
                  lineHeight: 1.55,
                  marginBottom: 8,
                  maxWidth: 600,
                }}
              >
                {author.bio}
              </p>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 8 }}>
              {total} {total === 1 ? 'article' : 'articles'}
            </div>
            {author.photo_credit && (
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--text-3)',
                  marginTop: 10,
                  opacity: 0.7,
                  fontStyle: 'italic',
                }}
              >
                {author.photo_credit}
              </div>
            )}
          </div>
        </header>

        {/* Articles grid */}
        {allPosts.length === 0 ? (
          <p style={{ color: 'var(--text-3)', fontSize: 14 }}>
            {author.name.split(/\s+/)[0]} hasn&apos;t published any articles yet.
          </p>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 20,
                marginBottom: 32,
              }}
            >
              {allPosts.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>

            {totalPages > 1 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                basePath={`/authors/${author.slug}`}
              />
            )}
          </>
        )}

        <div style={{ marginTop: 40 }}>
          <Link href="/authors" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
            ← All authors
          </Link>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
