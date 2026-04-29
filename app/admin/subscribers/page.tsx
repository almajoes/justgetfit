import { supabaseAdmin } from '@/lib/supabase-admin';
import { SubscribersClient } from '@/components/admin/SubscribersClient';
import type { Subscriber } from '@/lib/supabase';

// Force this page to render on every request — never cache.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata = {
  title: 'Subscribers · Admin',
};

export default async function SubscribersAdminPage() {
  // Explicit column list (no `*`) and explicit cast on the result
  const { data, error } = await supabaseAdmin
    .from('subscribers')
    .select(
      'id, email, status, source, confirmation_token, unsubscribe_token, subscribed_at, confirmed_at, unsubscribed_at, last_sent_at'
    )
    .order('subscribed_at', { ascending: false });

  if (error) {
    // Log to Vercel function logs and surface the error in the UI so we can see it
    console.error('[admin/subscribers] Query failed:', error);
    return (
      <div style={{ padding: 32, maxWidth: 1280, margin: '0 auto' }}>
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
          <strong>Database error:</strong> {error.message}
          {error.hint && <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>Hint: {error.hint}</div>}
          {error.code && <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>Code: {error.code}</div>}
        </div>
      </div>
    );
  }

  const subscribers = (data as Subscriber[]) || [];
  const stats = {
    total: subscribers.length,
    confirmed: subscribers.filter((s) => s.status === 'confirmed').length,
    pending: subscribers.filter((s) => s.status === 'pending').length,
    unsubscribed: subscribers.filter((s) => s.status === 'unsubscribed').length,
  };

  return <SubscribersClient subscribers={subscribers} stats={stats} />;
}
