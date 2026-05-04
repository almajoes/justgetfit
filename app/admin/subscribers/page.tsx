import { supabaseAdmin } from '@/lib/supabase-admin';
import { SubscribersClient } from '@/components/admin/SubscribersClient';
import type { Subscriber } from '@/lib/supabase';
import { markViewed } from '@/lib/admin-counts';

// Force this page to render on every request — never cache.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata = {
  title: 'Subscribers · Admin',
};

export default async function SubscribersAdminPage() {
  // Supabase REST API caps a single .select() at 1,000 rows by default.
  // For lists larger than 1,000 we page through with .range() until we've
  // got everything. We don't expect more than ~50k subscribers ever, so
  // pulling everything in memory for the admin page is fine.
  const PAGE = 1000;
  let allRows: Subscriber[] = [];
  let from = 0;
  let lastError: { message: string; hint?: string; code?: string } | null = null;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('subscribers')
      .select(
        'id, email, status, source, confirmation_token, unsubscribe_token, subscribed_at, confirmed_at, unsubscribed_at, last_sent_at'
      )
      .order('subscribed_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      lastError = error;
      break;
    }

    const batch = (data as Subscriber[]) || [];
    allRows = allRows.concat(batch);

    // Stop when we got fewer than a full page — that's the last page
    if (batch.length < PAGE) break;
    from += PAGE;

    // Safety bail-out — should never happen but prevents infinite loops
    if (from > 200000) break;
  }

  if (lastError) {
    console.error('[admin/subscribers] Query failed:', lastError);
    return (
      <div className="admin-page-pad" style={{ padding: 32, maxWidth: 1280, margin: '0 auto' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Subscribers</h1>
        <div
          style={{
            padding: 16,
            background: 'rgba(255,107,107,0.1)',
            border: '1px solid #ff6b6b',
            borderRadius: 12,
            color: '#ff6b6b',
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <strong>Database error:</strong> {lastError.message}
          {lastError.hint && <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>Hint: {lastError.hint}</div>}
          {lastError.code && <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>Code: {lastError.code}</div>}
        </div>
      </div>
    );
  }

  const subscribers = allRows;
  const stats = {
    total: subscribers.length,
    confirmed: subscribers.filter((s) => s.status === 'confirmed').length,
    pending: subscribers.filter((s) => s.status === 'pending').length,
    unsubscribed: subscribers.filter((s) => s.status === 'unsubscribed').length,
  };

  // Reset the subscribers counter — admin is looking at the page
  await markViewed('subscribers');

  return <SubscribersClient subscribers={subscribers} stats={stats} />;
}
