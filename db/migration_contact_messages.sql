-- =============================================================================
-- contact_messages table — stores all submissions from the public contact form
-- =============================================================================
-- Background: app/api/contact/route.ts has been calling
--   supabaseAdmin.from('contact_messages').insert({ ... })
-- since the contact form first launched, but the table was never actually
-- created. The insert was wrapped in a try/catch that silently swallowed the
-- "relation does not exist" error, so notification emails kept working but
-- nothing was ever persisted. All historical contact form submissions are
-- gone — there's no recovery path. From this migration forward, every
-- submission is saved.
--
-- Schema decisions:
--   * id: uuid primary key (matches the rest of the DB)
--   * created_at: timestamp the message was received
--   * read_at: NULL = unread (shows up in the unread badge), timestamp = read
--   * archived_at: NULL = active, timestamp = archived (hidden from default view)
--   * deleted_at: NULL = visible, timestamp = soft-deleted (hidden everywhere
--     except via SQL recovery)
--
-- We use timestamps instead of boolean flags because they double as audit
-- trail — you know WHEN you read/archived/deleted, not just THAT you did.
-- Costs nothing extra (Postgres timestamptz is the same size as a boolean
-- when you account for alignment), gains data.
--
-- Indexes:
--   * created_at desc — primary sort order for the inbox view
--   * read_at where null — fast unread-count badge queries
--   * partial index on (created_at) where deleted_at is null — the index used
--     by the inbox view, skips soft-deleted rows entirely
-- =============================================================================

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Submission payload
  name text not null,
  email text not null,
  subject text,                  -- nullable; subject is optional on the form
  message text not null,

  -- Inbox state
  read_at timestamptz,           -- null = unread
  archived_at timestamptz,       -- null = not archived
  deleted_at timestamptz         -- null = not deleted (soft-delete)
);

-- Sort by recency in the inbox
create index if not exists idx_contact_messages_created_at
  on public.contact_messages (created_at desc);

-- Unread-count badge query
create index if not exists idx_contact_messages_unread
  on public.contact_messages (created_at desc)
  where read_at is null and deleted_at is null;

-- Default inbox view query (active messages only)
create index if not exists idx_contact_messages_active
  on public.contact_messages (created_at desc)
  where deleted_at is null;
