import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Draft } from '@/lib/supabase';
import { DraftsClient } from '@/components/admin/DraftsClient';

export const dynamic = 'force-dynamic';

async function getData() {
  const [{ data: drafts }, { count: topicCount }] = await Promise.all([
    supabaseAdmin.from('drafts').select('*').order('created_at', { ascending: false }),
    supabaseAdmin.from('topics').select('*', { count: 'exact', head: true }).is('used_at', null),
  ]);

  return {
    drafts: (drafts ?? []) as Draft[],
    unusedTopicCount: topicCount ?? 0,
  };
}

export default async function AdminDraftsPage() {
  const { drafts, unusedTopicCount } = await getData();
  return <DraftsClient drafts={drafts} unusedTopicCount={unusedTopicCount} />;
}
