import Image from 'next/image';
import Link from 'next/link';
import type { Author } from '@/lib/supabase';

/**
 * <ArticleAuthorCard />
 *
 * "About the author" card rendered AFTER the article body, before
 * related-posts and the share section. Larger photo, full bio, and a
 * "More from <Author>" link to /authors/<slug>.
 *
 * Returns null when there's no author (legacy posts) — the bottom card
 * is purely additive context and doesn't make sense without a real
 * person to introduce.
 */

const PHOTO_SIZE = 80;

export function ArticleAuthorCard({ author }: { author: Author | null }) {
  if (!author) return null;

  return (
    <aside
      style={{
        display: 'flex',
        gap: 18,
        alignItems: 'flex-start',
        padding: 22,
        margin: '40px 0 24px',
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 14,
      }}
    >
      <PhotoOrMonogram author={author} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 6,
          }}
        >
          About the author
        </div>
        <Link
          href={`/authors/${author.slug}`}
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.01em',
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          {author.name}
        </Link>
        {author.bio && (
          <p
            style={{
              fontSize: 14.5,
              color: 'var(--text-2)',
              lineHeight: 1.55,
              margin: '8px 0 12px',
            }}
          >
            {author.bio}
          </p>
        )}
        <Link
          href={`/authors/${author.slug}`}
          style={{
            fontSize: 13,
            color: 'var(--neon)',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          More from {author.name.split(/\s+/)[0]} →
        </Link>
        {author.photo_credit && (
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-3)',
              marginTop: 14,
              opacity: 0.7,
              fontStyle: 'italic',
            }}
          >
            {author.photo_credit}
          </div>
        )}
      </div>
    </aside>
  );
}

function PhotoOrMonogram({ author }: { author: Author }) {
  if (author.photo_url) {
    return (
      <Image
        src={author.photo_url}
        alt={author.name}
        width={PHOTO_SIZE}
        height={PHOTO_SIZE}
        style={{
          width: PHOTO_SIZE,
          height: PHOTO_SIZE,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          border: '1px solid var(--line)',
        }}
        unoptimized
      />
    );
  }

  const initials = (() => {
    const parts = author.name.trim().split(/\s+/);
    if (parts.length === 0) return '·';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  })();

  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: PHOTO_SIZE,
        height: PHOTO_SIZE,
        borderRadius: '50%',
        background: 'rgba(196,255,61,0.12)',
        color: 'var(--neon)',
        fontWeight: 700,
        fontSize: 22,
        letterSpacing: '0.04em',
        flexShrink: 0,
        border: '1px solid rgba(196,255,61,0.25)',
      }}
    >
      {initials}
    </span>
  );
}
