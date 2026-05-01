import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Draft } from '@/lib/supabase';
import { DraftEditor } from '@/components/admin/DraftEditor';
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
 * inside DraftEditor. Same paging strategy as /admin/broadcast/page.tsx —
 * Supabase REST default limit is 1,000 rows so we page with .range().
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

export default async function DraftReviewPage({ params }: { params: { id: string } }) {
  const [draftRow, categories, subscribers] = await Promise.all([
    supabaseAdmin.from('drafts').select('*').eq('id', params.id).maybeSingle(),
    getCategories(),
    loadConfirmedSubscribers(),
  ]);
  const draft = draftRow.data;
  if (!draft) notFound();
  return (
    <div style={{ padding: 32, maxWidth: 1080, margin: '0 auto' }}>
      <Link
        href="/admin/drafts"
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
        ← All drafts
      </Link>
      <DraftEditor draft={draft as Draft} categories={categories} subscribers={subscribers} />
    </div>
  );
}
