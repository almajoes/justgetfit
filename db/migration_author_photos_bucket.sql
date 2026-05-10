-- Migration: author photo uploads (May 9 2026)
--
-- Creates a public Supabase Storage bucket for author profile photos.
-- "Public" = anyone with the URL can fetch the bytes (which is what we
-- want — the photos render on every public article page). Writes go
-- through our service role only — the bucket policy below blocks anon
-- uploads but allows reads.
--
-- Idempotent: re-running this is safe. The bucket insert uses
-- ON CONFLICT DO NOTHING; the policies use CREATE POLICY IF NOT EXISTS.

-- 1. Create the bucket. `public = true` means files inside are
--    publicly readable via the storage URL, but uploads still require
--    auth (handled by the policies below).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'author-photos',
  'author-photos',
  true,
  2097152,                                   -- 2 MB hard cap on uploads
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. Read policy — anyone can read (the bucket is public, but RLS still
--    needs an explicit policy for the path to work cleanly).
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'author_photos_public_read'
  ) then
    create policy author_photos_public_read on storage.objects
      for select using (bucket_id = 'author-photos');
  end if;
end $$;

-- 3. Write policy — only the service role can write. We don't expose
--    Supabase auth to admins; all uploads route through our Next.js
--    /api/admin/authors/upload-photo endpoint which uses the service key.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'author_photos_service_write'
  ) then
    create policy author_photos_service_write on storage.objects
      for insert with check (
        bucket_id = 'author-photos'
        and auth.role() = 'service_role'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'author_photos_service_update'
  ) then
    create policy author_photos_service_update on storage.objects
      for update using (
        bucket_id = 'author-photos'
        and auth.role() = 'service_role'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'author_photos_service_delete'
  ) then
    create policy author_photos_service_delete on storage.objects
      for delete using (
        bucket_id = 'author-photos'
        and auth.role() = 'service_role'
      );
  end if;
end $$;

-- Run this in Supabase SQL editor for the JustGetFit project (NOT
-- outlawfighters). Idempotent — safe to re-run.
