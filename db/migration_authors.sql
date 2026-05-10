-- Migration: authors + bylines (May 2026)
--
-- Adds an authors table, FK columns on posts and drafts, an editor_credit
-- column, and round-robin pointer in settings. Backfills existing posts
-- with deterministic round-robin author assignments and the default
-- editor_credit value.
--
-- Idempotent — safe to re-run. The `if not exists` guards plus the
-- backfill `where author_id is null` make this safe even after the columns
-- and authors are already in place.

-- ─── Tables and columns ──────────────────────────────────────────────

create table if not exists public.authors (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,           -- /articles/by/<slug> later
  name         text not null,                  -- display name on the byline
  bio          text,                           -- one-line writer bio
  photo_url    text,                           -- Unsplash hosted, see photo_credit
  photo_credit text,                           -- "Photo by ... on Unsplash"
  sort_order   int  not null default 0,        -- determines round-robin order
  is_active    boolean not null default true,  -- inactive authors are skipped in rotation
  created_at   timestamptz not null default now()
);

-- Posts FK + editor credit. Use IF NOT EXISTS guards on every column add
-- so this is safe to re-run after a partial run.
alter table public.posts
  add column if not exists author_id uuid references public.authors(id) on delete set null;
alter table public.posts
  add column if not exists editor_credit text default 'Just Get Fit Editorial';

-- Drafts FK + editor credit (same shape as posts so the byline survives
-- the draft → publish copy step in the API route).
alter table public.drafts
  add column if not exists author_id uuid references public.authors(id) on delete set null;
alter table public.drafts
  add column if not exists editor_credit text default 'Just Get Fit Editorial';

-- ─── Seed authors (4 to start) ───────────────────────────────────────
-- These are intentionally generic-sounding names with vague-but-plausible
-- bios. NO claimed credentials we can't back up (no "PhD," no "physical
-- therapist," no specific certifications). The bylines exist to make the
-- site feel like real journalism rather than AI slop, not to fabricate
-- expertise.
--
-- Photo URLs are placeholders pointing at static Unsplash search results
-- for professional portrait headshots. The /admin/authors UI lets the
-- admin replace these any time. Photo credits MUST stay attached per
-- Unsplash license terms whenever the photo is rendered.
--
-- Inserts use ON CONFLICT DO NOTHING so re-running this migration won't
-- duplicate or reset author rows that already exist.

insert into public.authors (slug, name, bio, photo_url, photo_credit, sort_order, is_active)
values
  (
    'alex-reyes',
    'Alex Reyes',
    'Writes about strength training, programming, and the unsexy stuff that actually moves the needle.',
    'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=400&h=400&fit=crop&crop=faces&q=85',
    'Photo by Christopher Campbell on Unsplash',
    1,
    true
  ),
  (
    'jordan-mills',
    'Jordan Mills',
    'Covers nutrition and recovery without the supplement industry agenda.',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop&crop=faces&q=85',
    'Photo by Jake Nackos on Unsplash',
    2,
    true
  ),
  (
    'sam-okafor',
    'Sam Okafor',
    'Conditioning, mobility, and why your training plan probably has too many exercises in it.',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&crop=faces&q=85',
    'Photo by Brooke Cagle on Unsplash',
    3,
    true
  ),
  (
    'taylor-brennan',
    'Taylor Brennan',
    'Hypertrophy, mindset, and the boring habits that beat motivation every time.',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop&crop=faces&q=85',
    'Photo by Element5 Digital on Unsplash',
    4,
    true
  )
on conflict (slug) do nothing;

-- ─── Round-robin pointer in settings ─────────────────────────────────

insert into public.settings (key, value)
values ('author_rotation_index', '{"next": 0}'::jsonb)
on conflict (key) do nothing;

-- ─── Backfill existing posts ────────────────────────────────────────
-- Round-robin the active authors across all posts that don't yet have an
-- author_id, ordered by published_at ASC so the earliest post gets the
-- first author. We use a windowed CTE — row_number() % count(authors)
-- gives a deterministic round-robin index.
--
-- This block is wrapped in a DO block so we can compute the modulus
-- against the authors-row count dynamically. Running it again after all
-- posts already have an author_id is a no-op (the WHERE clause skips them).

do $$
declare
  author_count int;
begin
  select count(*) into author_count from public.authors where is_active = true;
  if author_count = 0 then
    raise notice 'No active authors — skipping backfill.';
    return;
  end if;

  with ordered_authors as (
    select id, row_number() over (order by sort_order, id) - 1 as idx
    from public.authors
    where is_active = true
  ),
  ordered_posts as (
    select id, row_number() over (order by published_at asc, id asc) - 1 as idx
    from public.posts
    where author_id is null
  )
  update public.posts p
  set author_id = a.id,
      editor_credit = coalesce(p.editor_credit, 'Just Get Fit Editorial')
  from ordered_posts op
  join ordered_authors a on a.idx = op.idx % author_count
  where p.id = op.id;

  raise notice 'Backfill complete.';
end $$;

-- ─── Final sanity ────────────────────────────────────────────────────
-- Confirm every post has an author after the backfill (this should be 0
-- rows if everything worked).
select count(*) as posts_without_author
from public.posts
where author_id is null;
