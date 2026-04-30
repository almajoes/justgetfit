import { supabaseAdmin } from '@/lib/supabase-admin';
import { BroadcastClient } from '@/components/admin/BroadcastClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata = { title: 'Broadcast · Admin' };

export default async function BroadcastAdminPage() {
  // Pull all confirmed subscribers (id, email, source) for the audience picker.
  // Order by most recent signup so the newest are at the top.
  const { data: subs } = await supabaseAdmin
    .from('subscribers')
    .select('id, email, source, subscribed_at')
    .eq('status', 'confirmed')
    .order('subscribed_at', { ascending: false });

  return <BroadcastClient subscribers={subs || []} />;
}
