import Image from 'next/image';
import Link from 'next/link';
import type { Author } from '@/lib/supabase';

/**
 * <ArticleByline />
 *
 * Top-of-article byline shown between the lede and the cover image.
 * Compact: avatar + name + one-line bio + "Edited by ..." line.
 *
 * Avatar and name link to /authors/<slug> (the author detail page).
 * The link is suppressed when there's no author (legacy posts) since
 * there's no destination to point to.
 *
 * A larger, fuller "About the author" card lives at the bottom of the
 * article (see <ArticleAuthorCard/>). The two are intentionally
 * different: this one anchors "who wrote this" before the read; that one
 * answers "want to read more from them" after the read.
 *
 * Photo credit: Unsplash license requires the photographer credit be
 * shown wherever their photo appears. Custom uploads don't need credit.
 * We render the credit line only when photo_credit is non-null.
 */

const SIZE = 48;

export function ArticleByline({
  author,
  editorCredit,
}: {
  author: Author | null;
  editorCredit: string;
}) {
  const name = author?.name ?? editorCredit;
  // Link target: only meaningful when we have an author. For legacy posts
  // with no author the avatar + name render as plain content, no link.
  const linkHref = author ? `/authors/${author.slug}` : null;

  // The avatar + name pair is wrapped in a Link when we have an author,
  // a div otherwise. Pulled into a small helper to keep the render readable.
  const HeaderInner = (
    <>
      <Avatar author={author} />
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text)',
            letterSpacing: '-0.005em',
          }}
        >
          {name}
        </div>
        {author?.bio && (
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--text-2)',
              marginTop: 3,
              lineHeight: 1.45,
            }}
          >
            {author.bio}
          </div>
        )}
        {author && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-3)',
              marginTop: 4,
            }}
          >
            Edited by {editorCredit}
          </div>
        )}
        {author?.photo_credit && (
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-3)',
              marginTop: 4,
              opacity: 0.7,
              fontStyle: 'italic',
            }}
          >
            {author.photo_credit}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        margin: '0 0 36px',
        padding: '14px 16px',
        background: 'var(--bg-1)',
        border: '1px solid var(--line)',
        borderRadius: 12,
      }}
    >
      {linkHref ? (
        <Link
          href={linkHref}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flex: 1,
            minWidth: 0,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          {HeaderInner}
        </Link>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
          {HeaderInner}
        </div>
      )}
    </div>
  );
}

/**
 * Avatar — author photo or initial-monogram fallback.
 */
function Avatar({ author }: { author: Author | null }) {
  if (author?.photo_url) {
    return (
      <Image
        src={author.photo_url}
        alt={author.name}
        width={SIZE}
        height={SIZE}
        style={{
          width: SIZE,
          height: SIZE,
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
    if (!author) return 'JGF';
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
        width: SIZE,
        height: SIZE,
        borderRadius: '50%',
        background: 'rgba(196,255,61,0.12)',
        color: 'var(--neon)',
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: '0.04em',
        flexShrink: 0,
        border: '1px solid rgba(196,255,61,0.25)',
      }}
    >
      {initials}
    </span>
  );
}
