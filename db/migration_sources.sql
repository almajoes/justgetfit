-- Migration: add sources column for inline citations + Sources sections.
--
-- Stores an array of citation objects on each post (and corresponding
-- drafts). Body content (posts.content) carries inline [1], [2] markers
-- that reference the n field on each source entry.
--
-- Source shape:
--   {
--     "n": 1,                                    // matches [1] in body
--     "title": "Effects of resistance training on muscle hypertrophy",
--     "url": "https://pubmed.ncbi.nlm.nih.gov/...",
--     "publication": "PubMed | Cochrane | NYTimes | ..." | null,
--     "quote": "Direct excerpt from the source." | null,  // null = source-only
--     "accessed_at": "2026-05-09T..."           // ISO timestamp
--   }
--
-- Idempotent. Safe to re-run.

alter table public.posts
  add column if not exists sources jsonb;

alter table public.drafts
  add column if not exists sources jsonb;

-- Optional GIN index on sources for the rare case we want to query
-- "all posts citing this URL" later. Cheap insurance — small DB.
create index if not exists posts_sources_gin
  on public.posts using gin (sources);

-- Verify (read-only).
select count(*) filter (where sources is not null) as posts_with_sources,
       count(*) as total_posts
from public.posts;
