import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Post } from '@/lib/supabase';
import { PostEditor } from '@/components/admin/PostEditor';
import { getCategories } from '@/lib/cms';
import { loadConfirmedSubscribers } from '@/lib/subscribers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function EditPostPage({ params }: { params: { id: string } }) {
  const [postRow, categories, subscribers] = await Promise.all([
    supabaseAdmin.from('posts').select('*').eq('id', params.id).maybeSingle(),
    getCategories(),
    loadConfirmedSubscribers(),
  ]);
  const post = postRow.data;
  if (!post) notFound();
  return (
    <div className="admin-page-pad" style={{ padding: 32, maxWidth: 1080, margin: '0 auto' }}>
      <Link
        href="/admin/posts"
        style={{
          display: 'inline-block',
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-3)',
          textDecoration: 'none',
          marginBottom: 24,
        }}
      >
        ← All posts
      </Link>
      <PostEditor post={post as Post} categories={categories} subscribers={subscribers} />
    </div>
  );
}
