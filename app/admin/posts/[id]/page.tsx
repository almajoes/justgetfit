import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Post } from '@/lib/supabase';
import { PostEditor } from '@/components/admin/PostEditor';
import { getCategories } from '@/lib/cms';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type SubRow = {
  id: string;
  email: string;
  source: string | null;
  subscribed_at: string;
};

/**
 * Pull all confirmed subscribers (id, email, source) for the AudiencePicker
 * inside PostEditor's ResendPanel. Same paging strategy as
 * /admin/broadcast/page.tsx — Supabase REST default limit is 1,000 rows.
 */
async function loadConfirmedSubscribers(): Promise<SubRow[]> {
  const PAGE = 1000;
  let all: SubRow[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabaseAdmin
      .from('subscribers')
      .select('id, email, source, subscribed_at')
      .eq('status', 'confirmed')
      .order('subscribed_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    const batch = (data as SubRow[]) || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    from += PAGE;
    if (from > 200000) break; // safety bail
  }
  return all;
}

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
