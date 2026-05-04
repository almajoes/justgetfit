-- =============================================================================
-- pages: allow 'app' slug
-- =============================================================================
-- The /app page (May 3 2026) was originally hardcoded. To make it editable
-- via /admin/pages/app, we only need to ensure the slug check constraint
-- (if any) doesn't reject 'app'.
--
-- We do NOT pre-insert a pages row. The lib/cms.ts getter returns
-- APP_DEFAULT when the row is missing (fallback path), so /app renders
-- correctly out of the box. The first time an admin saves edits via
-- /admin/pages/app, the API route's upsert creates the row.
--
-- Idempotent — drops + re-creates the constraint each run, safe to re-execute.
-- =============================================================================

do $$
begin
  alter table public.pages drop constraint if exists pages_slug_check;
  alter table public.pages add constraint pages_slug_check
    check (slug in ('home-hero', 'about', 'subscribe', 'contact', 'app'));
exception
  when undefined_table then
    -- pages table doesn't exist; nothing to do
    null;
  when undefined_column then
    -- slug column doesn't exist; nothing to do
    null;
end $$;
