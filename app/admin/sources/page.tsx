import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { SourcesClient } from '@/components/admin/SourcesClient';
import type { Post, Source } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata = { title: 'Sources · Admin' };

/**
 * Admin /admin/sources — audit + hygiene for the citations system.
 *
 * Pulls every post that has any sources (and a count of those without)
 * so the client can offer "by article" / "by source" / "uncited" views
 * with a single hydration cycle. Server fetches, client renders + does
 * the URL-checking interactions.
 */

type PostRow = Pick<Post, 'id' | 'slug' | 'title' | 'category' | 'published_at' | 'sources' | 'rejected_sources'>;

export default async function SourcesAdminPage() {
  // Pull posts. We want title/slug/category for navigation, sources for
  // the listing, rejected_sources for the new review tab. Filter to
  // posts that exist (deleted ones obviously can't be on the page) but
  // include ones with null/empty sources so the "uncited" tab can show
  // them.
  const { data, error } = await supabaseAdmin
    .from('posts')
    .select('id, slug, title, category, published_at, sources, rejected_sources')
    .order('published_at', { ascending: false });

  if (error) {
    return (
      <div className="admin-page-pad" style={{ padding: 32 }}>
        <p style={{ color: '#ff9c9c' }}>Failed to load posts: {error.message}</p>
      </div>
    );
  }

  const posts = (data ?? []) as PostRow[];

  // Pre-compute aggregates server-side so the client doesn't have to
  // re-derive them on every render.
  const stats = {
    total: posts.length,
    withCitations: posts.filter((p) => Array.isArray(p.sources) && p.sources.length > 0).length,
    ranButEmpty: posts.filter((p) => Array.isArray(p.sources) && p.sources.length === 0).length,
    neverRun: posts.filter((p) => p.sources === null || p.sources === undefined).length,
    totalSources: posts.reduce(
      (sum, p) => sum + (Array.isArray(p.sources) ? p.sources.length : 0),
      0
    ),
    totalRejected: posts.reduce(
      (sum, p) => sum + (Array.isArray(p.rejected_sources) ? p.rejected_sources.length : 0),
      0
    ),
  };

  return (
    <div className="admin-page-pad" style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/admin/posts"
          style={{
            display: 'inline-block',
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-3)',
            textDecoration: 'none',
            marginBottom: 16,
          }}
        >
          ← Back to posts
        </Link>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' }}>
          Sources
        </h1>
        <p style={{ color: 'var(--text-2)', margin: 0, fontSize: 14, lineHeight: 1.55 }}>
          Citation audit + hygiene. Toggle between &ldquo;By article&rdquo;, &ldquo;By source&rdquo;, and &ldquo;Uncited&rdquo; views. Run &ldquo;Check links&rdquo; to verify every URL still returns 200.
        </p>
      </div>

      <SourcesClient posts={posts} stats={stats} />
    </div>
  );
}
