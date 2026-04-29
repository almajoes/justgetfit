import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Topic } from '@/lib/supabase';
import { TopicsClient } from '@/components/admin/TopicsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function AdminTopicsPage() {
  const { data } = await supabaseAdmin
    .from('topics')
    .select('*')
    .order('used_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false });
  return <TopicsClient topics={(data ?? []) as Topic[]} />;
}
