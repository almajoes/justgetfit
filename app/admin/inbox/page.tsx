import { supabaseAdmin } from '@/lib/supabase-admin';
import { InboxClient } from '@/components/admin/InboxClient';

// ─── Aggressive cache-busting ──────────────────────────────────────────
// Triple-belt-and-suspenders to make sure Next.js / Vercel never ever serve
// stale HTML for this page. Inbox content can change second-to-second (new
// submissions, deletions, mark-read), so any caching is wrong here.
//   - dynamic = 'force-dynamic' → opt out of static generation entirely
//   - revalidate = 0           → no ISR caching
//   - fetchCache = 'force-no-store' → don't cache any fetches inside
//   - runtime nodejs           → use the same runtime as the rest of admin
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Inbox · Admin',
  robots: { index: false, follow: false },
};

type Filter = 'inbox' | 'archived' | 'deleted';

type MessageRow = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  read_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
};

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

  // Pull every message in the table, then filter in JS. With contact form
  // submissions, the table will never be larger than a few thousand rows
  // even at peak — well within memory budget. Doing the filtering server-side
  // in JS instead of via .is() / .not() avoids any chance of Supabase quirks
  // around null comparisons leaking through.
  const { data, error } = await supabaseAdmin
    .from('contact_messages')
    .select('id, created_at, name, email, subject, message, read_at, archived_at, deleted_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: true });

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

  const allMessages: MessageRow[] = (data as MessageRow[]) || [];

  // Compute counts (always against the full set, not filtered)
  const counts = {
    inbox: allMessages.filter((m) => !m.archived_at && !m.deleted_at).length,
    archived: allMessages.filter((m) => m.archived_at && !m.deleted_at).length,
    deleted: allMessages.filter((m) => m.deleted_at).length,
    unread: allMessages.filter((m) => !m.read_at && !m.archived_at && !m.deleted_at).length,
  };

  // Apply the active filter
  let visibleMessages: MessageRow[];
  if (filter === 'inbox') {
    visibleMessages = allMessages.filter((m) => !m.archived_at && !m.deleted_at);
  } else if (filter === 'archived') {
    visibleMessages = allMessages.filter((m) => m.archived_at && !m.deleted_at);
  } else {
    visibleMessages = allMessages.filter((m) => m.deleted_at);
  }

  return (
    <InboxClient
      initialMessages={visibleMessages}
      filter={filter}
      counts={counts}
    />
  );
}
