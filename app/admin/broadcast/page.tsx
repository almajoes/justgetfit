import { BroadcastClient } from '@/components/admin/BroadcastClient';
import { loadConfirmedSubscribers } from '@/lib/subscribers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata = { title: 'Broadcast · Admin' };

export default async function BroadcastAdminPage() {
  const subscribers = await loadConfirmedSubscribers();
  return <BroadcastClient subscribers={subscribers} />;
}
