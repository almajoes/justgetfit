import { supabaseAdmin } from '@/lib/supabase-admin';
import { InboxClient } from '@/components/admin/InboxClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Inbox · Admin',
  robots: { index: false, follow: false },
};

type Filter = 'inbox' | 'archived' | 'deleted';

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const filter: Filter =
    searchParams.filter === 'archived'
      ? 'archived'
      : searchParams.filter === 'deleted'
        ? 'deleted'
        : 'inbox';

  // Fetch messages for the active filter.
  //   inbox    → not archived AND not deleted (default)
  //   archived → archived AND not deleted
  //   deleted  → deleted (regardless of archive status)
  let query = supabaseAdmin
    .from('contact_messages')
    .select('id, created_at, name, email, subject, message, read_at, archived_at, deleted_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: true }); // tiebreaker for same-timestamp rows

  if (filter === 'inbox') {
    query = query.is('archived_at', null).is('deleted_at', null);
  } else if (filter === 'archived') {
    query = query.not('archived_at', 'is', null).is('deleted_at', null);
  } else {
    query = query.not('deleted_at', 'is', null);
  }

  const { data: messages, error } = await query;

  if (error) {
    return (
      <div className="admin-page-pad" style={{ padding: 32, maxWidth: 1080, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 16 }}>Inbox</h1>
        <div style={{ padding: 16, background: 'rgba(255,107,107,0.1)', border: '1px solid #ff6b6b', borderRadius: 8, color: '#ff6b6b' }}>
          Failed to load messages: {error.message}
        </div>
      </div>
    );
  }

  // Counts for the filter pills (run as separate count queries so they don't
  // depend on the filter we're currently viewing). Using HEAD count for
  // efficiency (no row data shipped).
  const [{ count: inboxCount }, { count: archivedCount }, { count: deletedCount }, { count: unreadCount }] =
    await Promise.all([
      supabaseAdmin.from('contact_messages').select('id', { count: 'exact', head: true })
        .is('archived_at', null).is('deleted_at', null),
      supabaseAdmin.from('contact_messages').select('id', { count: 'exact', head: true })
        .not('archived_at', 'is', null).is('deleted_at', null),
      supabaseAdmin.from('contact_messages').select('id', { count: 'exact', head: true })
        .not('deleted_at', 'is', null),
      supabaseAdmin.from('contact_messages').select('id', { count: 'exact', head: true })
        .is('read_at', null).is('archived_at', null).is('deleted_at', null),
    ]);

  return (
    <InboxClient
      initialMessages={messages || []}
      filter={filter}
      counts={{
        inbox: inboxCount ?? 0,
        archived: archivedCount ?? 0,
        deleted: deletedCount ?? 0,
        unread: unreadCount ?? 0,
      }}
    />
  );
}
