import Link from 'next/link';
import type { Post } from '@/lib/supabase';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const CATEGORY_GRADIENTS: Record<string, string> = {
  strength:     'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  hypertrophy:  'linear-gradient(135deg, #5e2c8b 0%, #8e2de2 50%, #4a00e0 100%)',
  nutrition:    'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
  recovery:     'linear-gradient(135deg, #2c3e50 0%, #4ca1af 100%)',
  conditioning: 'linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)',
  mobility:     'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
  programming:  'linear-gradient(135deg, #232526 0%, #414345 100%)',
  mindset:      'linear-gradient(135deg, #2c1f5b 0%, #6b3aa0 50%, #a064d6 100%)',
  default:      'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
};

export function PostCard({ post }: { post: Post }) {
  const fallbackBg =
    CATEGORY_GRADIENTS[post.category?.toLowerCase() ?? ''] ?? CATEGORY_GRADIENTS.default;

  const imgStyle: React.CSSProperties = post.cover_image_url
    ? {
        backgroundImage: `url('${post.cover_image_url}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { background: fallbackBg };

  return (
    <Link href={`/articles/${post.slug}`} className="post-card">
      <div className="post-img" style={imgStyle}>
        {post.category && <span className="post-cat-badge">{post.category}</span>}
      </div>
      <div className="post-body">
        <h3>{post.title}</h3>
        {post.excerpt && <p className="post-excerpt">{post.excerpt}</p>}
        <div className="post-footer">
          <span>{formatDate(post.published_at)}</span>
          {post.read_minutes && <span>{post.read_minutes} min</span>}
        </div>
      </div>
    </Link>
  );
}
