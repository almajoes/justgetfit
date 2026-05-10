-- Migration: add rejected_sources column for citation review.
--
-- During the citation pipeline we verify each proposed source (URL +
-- title match). Rejected sources used to be silently dropped. This
-- column persists them so the Sources admin page can show them with
-- their rejection reason, and the admin can approve borderline cases
-- manually if they want.
--
-- Shape: array of {
--   title: string,
--   url: string,
--   publication: string | null,
--   quote: string | null,
--   reason: string         -- e.g. "HTTP 404", "title mismatch (1/12 = 0.08...)"
-- }
--
-- Idempotent. Safe to re-run.

alter table public.posts
  add column if not exists rejected_sources jsonb;

alter table public.drafts
  add column if not exists rejected_sources jsonb;

-- No GIN index here — rejection data is rarely queried, just shown
-- inline on the sources admin page. Lookups are by post_id which is
-- already PK.

-- Verify (read-only).
select count(*) filter (where rejected_sources is not null) as posts_with_rejections,
       count(*) as total_posts
from public.posts;
