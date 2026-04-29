import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Draft } from '@/lib/supabase';
import { DraftEditor } from '@/components/admin/DraftEditor';
import { getCategories } from '@/lib/cms';

export const dynamic = 'force-dynamic';

export default async function DraftReviewPage({ params }: { params: { id: string } }) {
  const [draftRow, categories] = await Promise.all([
    supabaseAdmin.from('drafts').select('*').eq('id', params.id).maybeSingle(),
    getCategories(),
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
      <DraftEditor draft={draft as Draft} categories={categories} />
    </div>
  );
}
