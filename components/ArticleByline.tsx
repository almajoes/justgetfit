import Image from 'next/image';
import type { Author } from '@/lib/supabase';

/**
 * <ArticleByline />
 *
 * Renders the per-article byline shown between the lede and the cover
 * image on /articles/<cat>/<slug>:
 *
 *   ┌────────┐  Alex Reyes
 *   │ photo  │  Edited by Just Get Fit Editorial
 *   └────────┘
 *
 * Photo: 48px circular avatar from author.photo_url. If the author has no
 * photo (or no author at all — legacy posts), we fall back to a
 * monogram-style colored circle with the author's initials, or a generic
 * "JGF" mark when there's no author.
 *
 * Photo credit: Unsplash license requires the photographer credit be shown
 * wherever their photo appears. We render it as a small italic line below
 * the byline (visually quiet but compliant). When the author has no photo
 * the credit is omitted because we're rendering a generated avatar.
 *
 * Edited by: always rendered, defaults to "Just Get Fit Editorial." This
 * is a deliberate trust signal — even when a real byline is shown, the
 * "Edited by" line communicates that the article passes through editorial
 * review.
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
        {author && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-3)',
              marginTop: 2,
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
    </div>
  );
}

/**
 * Avatar — author photo or initial-monogram fallback.
 * Uses next/image when we have a real URL so the photo is optimized;
 * falls back to a styled <span> with initials when there's no photo.
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
        // Unsplash hosts these images. We don't trust the URL enough to
        // mark them priority — they're below-the-fold-ish and the
        // user's main read is the article body, not the byline.
        unoptimized
      />
    );
  }

  // Initials fallback. For "Alex Reyes" → "AR"; for missing author → "JGF".
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
