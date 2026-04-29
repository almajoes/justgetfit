import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Post } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function AdminPostsPage() {
  const { data } = await supabaseAdmin
    .from('posts')
    .select('*')
    .order('published_at', { ascending: false });
  const posts = (data ?? []) as Post[];

  return (
    <div>
      <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--neon)' }}>Admin</p>
      <h1 className="text-4xl md:text-5xl font-bold mb-2" style={{ letterSpacing: '-0.02em' }}>Published posts</h1>
      <p className="mb-8" style={{ color: 'var(--text-2)' }}>{posts.length} posts</p>

      <div className="space-y-2">
        {posts.length === 0 ? (
          <p className="italic" style={{ color: 'var(--text-3)' }}>No posts yet. Publish a draft first.</p>
        ) : (
          posts.map((p) => (
            <Link
              key={p.id}
              href={`/admin/posts/${p.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg hover:bg-white/5 transition-colors"
              style={{ textDecoration: 'none', color: 'var(--text)', border: '1px solid var(--line)' }}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {p.cover_image_url && (
                  <div
                    className="w-12 h-12 rounded shrink-0"
                    style={{ backgroundImage: `url('${p.cover_image_url}')`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.title}</div>
                  <div className="text-xs flex gap-2 mt-1" style={{ color: 'var(--text-3)' }}>
                    {p.category && <span style={{ color: 'var(--neon)' }}>{p.category}</span>}
                    <span>{new Date(p.published_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Edit →</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
