import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Draft } from '@/lib/supabase';
import { DraftsClient } from '@/components/admin/DraftsClient';

// Force fresh data on every request - never cache
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

async function getData() {
  const [{ data: drafts, error: draftsError }, { count: topicCount }] = await Promise.all([
    supabaseAdmin.from('drafts').select('*').order('created_at', { ascending: false }),
    supabaseAdmin.from('topics').select('*', { count: 'exact', head: true }).is('used_at', null),
  ]);

  if (draftsError) {
    console.error('[admin/drafts] Query failed:', draftsError);
  }

  return {
    drafts: (drafts ?? []) as Draft[],
    unusedTopicCount: topicCount ?? 0,
    error: draftsError?.message ?? null,
  };
}

export default async function AdminDraftsPage() {
  const { drafts, unusedTopicCount, error } = await getData();
  if (error) {
    return (
      <div style={{ padding: 32, maxWidth: 1280, margin: '0 auto' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Drafts</h1>
        <div style={{ padding: 16, background: 'rgba(255,107,107,0.1)', border: '1px solid #ff6b6b', borderRadius: 12, color: '#ff6b6b' }}>
          <strong>Database error:</strong> {error}
        </div>
      </div>
    );
  }
  return <DraftsClient drafts={drafts} unusedTopicCount={unusedTopicCount} />;
}
