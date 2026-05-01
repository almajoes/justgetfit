-- =============================================================================
-- email_jobs migration
-- =============================================================================
-- Adds the queue table that backs the chunked-send system. Newsletters and
-- broadcasts no longer fan out synchronously inside a 60s API handler.
-- Instead, a row is inserted here, and an internal worker route pops chunks
-- of subscriber IDs from `pending_ids` (using plain UPDATE ... RETURNING in
-- TypeScript — no plpgsql functions involved). The worker re-triggers itself
-- until pending_ids is empty.
--
-- The admin UI polls `/api/admin/jobs/<id>/status` to show a progress bar.
-- See lib/email-jobs.ts and app/api/_internal/jobs/process/route.ts.
--
-- IDEMPOTENT: re-runnable via IF NOT EXISTS. Safe to run multiple times.
-- =============================================================================

create table if not exists public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('newsletter', 'broadcast')),

  -- What we're sending
  subject text not null,
  body_markdown text,
  post_id uuid references public.posts(id) on delete set null,
  send_id uuid references public.newsletter_sends(id) on delete set null,

  -- The recipient queue. Resolved once at job creation; shrinks as chunks
  -- complete. processed_count grows as chunks complete (success + failure).
  pending_ids uuid[] not null default array[]::uuid[],
  total_recipients int not null default 0,
  processed_count int not null default 0,
  failed_count int not null default 0,

  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'canceled')),
  error_message text,

  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  -- Heartbeat: updated at the end of every chunk. Used for stall detection.
  last_chunk_at timestamptz
);

create index if not exists email_jobs_status_idx on public.email_jobs (status, created_at desc);
create index if not exists email_jobs_send_id_idx on public.email_jobs (send_id);

-- RLS: deny anon/authenticated reads (service role bypasses RLS automatically).
-- Server code uses service role; clients never read this table directly.
alter table public.email_jobs enable row level security;
