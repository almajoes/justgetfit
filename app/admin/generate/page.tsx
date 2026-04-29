import { supabaseAdmin } from '@/lib/supabase-admin';
import { GenerateClient } from '@/components/admin/GenerateClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Generate · Admin' };

export default async function GenerateAdminPage() {
  // Count unused topics so the UI can cap user input
  const { count: unusedTopicCount } = await supabaseAdmin
    .from('topics')
    .select('*', { count: 'exact', head: true })
    .is('used_at', null);

  // Count existing posts for the "have you done backfill yet" check
  const { count: postCount } = await supabaseAdmin
    .from('posts')
    .select('*', { count: 'exact', head: true });

  return (
    <GenerateClient
      unusedTopicCount={unusedTopicCount || 0}
      postCount={postCount || 0}
    />
  );
}
