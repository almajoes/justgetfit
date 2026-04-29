import { supabaseAdmin } from '@/lib/supabase-admin';
import { BroadcastClient } from '@/components/admin/BroadcastClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Broadcast · Admin' };

export default async function BroadcastAdminPage() {
  // Count confirmed subscribers so the UI can show how many people will get this
  const { count: confirmedCount } = await supabaseAdmin
    .from('subscribers')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'confirmed');

  return <BroadcastClient confirmedCount={confirmedCount || 0} />;
}
