import { supabaseAdmin } from '@/lib/supabase-admin';
import { GenerateClient } from '@/components/admin/GenerateClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata = { title: 'Generate · Admin' };

export default async function GenerateAdminPage() {
  // Count unused topics so the UI can cap user input
  const { count: unusedTopicCount } = await supabaseAdmin
    .from('topics')
    .select('*', { count: 'exact', head: true })
    .is('used_at', null);

  return <GenerateClient unusedTopicCount={unusedTopicCount || 0} />;
}
