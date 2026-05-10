-- Migration: add the public /authors link to the main nav, positioned
-- between "About Us" and "Categories".
--
-- Approach:
--   1. Insert a new nav row pointing to /authors with sort_order set
--      between the About Us and Categories rows we find.
--   2. Idempotent — if a row with location='main_nav' AND url='/authors'
--      already exists, do nothing.
--
-- The sort_order math: pick the row labeled "About" (or url='/about'),
-- pick the row labeled "Categories" (or matching the categories url).
-- Set the new sort_order to the average of those two so it slots in
-- between. If the user has reordered things and that math doesn't make
-- sense, run "UPDATE nav_items SET sort_order = ... WHERE id = ..."
-- manually to fix up.

do $$
declare
  about_order int;
  categories_order int;
  insert_order int;
  existing_count int;
begin
  -- Already inserted? Bail.
  select count(*) into existing_count
  from public.nav_items
  where location = 'main_nav' and url = '/authors';
  if existing_count > 0 then
    raise notice 'Authors nav item already exists — skipping.';
    return;
  end if;

  -- Find the About item — match by URL or label.
  select sort_order into about_order
  from public.nav_items
  where location = 'main_nav' and active = true
    and (url = '/about' or lower(label) like 'about%')
  order by sort_order asc
  limit 1;

  -- Find the Categories item — match by URL or label.
  select sort_order into categories_order
  from public.nav_items
  where location = 'main_nav' and active = true
    and (url = '/articles' or url = '/categories' or lower(label) like 'categor%')
  order by sort_order asc
  limit 1;

  if about_order is null and categories_order is null then
    -- Neither found — fall back to "append at the end".
    select coalesce(max(sort_order), 0) + 10 into insert_order
    from public.nav_items
    where location = 'main_nav';
  elsif about_order is not null and categories_order is not null then
    -- Both found — slot in between. Floor to int because sort_order is int.
    insert_order := (about_order + categories_order) / 2;
    -- Edge case: they're adjacent (e.g. 30 and 31). Push categories down
    -- by 10 to make room, then put us right after about.
    if insert_order = about_order or insert_order = categories_order then
      update public.nav_items
      set sort_order = sort_order + 10
      where location = 'main_nav' and sort_order >= categories_order;
      insert_order := about_order + 5;
    end if;
  elsif about_order is not null then
    insert_order := about_order + 5;
  else
    insert_order := categories_order - 5;
  end if;

  insert into public.nav_items (location, label, url, is_cta, new_tab, sort_order, active)
  values ('main_nav', 'Authors', '/authors', false, false, insert_order, true);

  raise notice 'Inserted Authors nav at sort_order=%', insert_order;
end $$;

-- Verify after running:
select label, url, sort_order, active from public.nav_items
where location = 'main_nav'
order by sort_order;
