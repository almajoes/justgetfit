import { supabaseAdmin } from '@/lib/supabase-admin';
import { SubscribersClient } from '@/components/admin/SubscribersClient';
import type { Subscriber } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Subscribers · Admin',
};

export default async function SubscribersAdminPage() {
  const { data } = await supabaseAdmin
    .from('subscribers')
    .select('*')
    .order('subscribed_at', { ascending: false });

  const subscribers = (data as Subscriber[]) || [];
  const stats = {
    total: subscribers.length,
    confirmed: subscribers.filter((s) => s.status === 'confirmed').length,
    pending: subscribers.filter((s) => s.status === 'pending').length,
    unsubscribed: subscribers.filter((s) => s.status === 'unsubscribed').length,
  };

  return <SubscribersClient subscribers={subscribers} stats={stats} />;
}
