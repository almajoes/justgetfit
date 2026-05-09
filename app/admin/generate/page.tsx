import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Topic } from '@/lib/supabase';
import { GenerateClient } from '@/components/admin/GenerateClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata = { title: 'Generate · Admin' };

export default async function GenerateAdminPage() {
  // Fetch all unused topics so the admin can pick which ones to generate
  // drafts from. Sorted oldest-first so topics that have been waiting
  // longest surface to the top of the list.
  const { data } = await supabaseAdmin
    .from('topics')
    .select('*')
    .is('used_at', null)
    .order('created_at', { ascending: true });

  const unusedTopics = (data ?? []) as Topic[];

  return <GenerateClient unusedTopics={unusedTopics} />;
}
