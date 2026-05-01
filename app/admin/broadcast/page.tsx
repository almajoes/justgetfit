import { supabaseAdmin } from '@/lib/supabase-admin';
import { BroadcastClient } from '@/components/admin/BroadcastClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata = { title: 'Broadcast · Admin' };

type SubRow = {
  id: string;
  email: string;
  source: string | null;
  subscribed_at: string;
};

export default async function BroadcastAdminPage() {
  // Pull all confirmed subscribers (id, email, source) for the audience picker.
  // Supabase REST default limit is 1,000 rows per query — we have to page
  // through with .range() to get them all when the list grows past that.
  const PAGE = 1000;
  let all: SubRow[] = [];
  let from = 0;

  while (true) {
    const { data } = await supabaseAdmin
      .from('subscribers')
      .select('id, email, source, subscribed_at')
      .eq('status', 'confirmed')
      .order('subscribed_at', { ascending: false })
      .range(from, from + PAGE - 1);

    const batch = (data as SubRow[]) || [];
    all = all.concat(batch);

    if (batch.length < PAGE) break;
    from += PAGE;

    // Safety bail-out — prevents infinite loops if something goes sideways
    if (from > 200000) break;
  }

  return <BroadcastClient subscribers={all} />;
}
