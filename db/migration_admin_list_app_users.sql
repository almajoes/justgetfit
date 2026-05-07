-- Migration: app_users RPC for the /admin/subscribers "Active app users" modal.
--
-- Returns one row per subscriber who is currently using the app — defined as
-- having a program_state row with status IN ('active', 'paused'). Multiple
-- rows can exist per user (past programs accumulate as 'replaced' or
-- 'completed'); we take the most recent active/paused row by started_at.
--
-- Pagination: caller passes p_limit and p_offset. Total count is returned in
-- the same row so the client can build the paginator without a second query.
--
-- Security: the function is SECURITY DEFINER and runs as the function owner
-- (a superuser when run in Supabase SQL editor), which is what gives it
-- read access to auth.users. Only the service role should ever call it —
-- the API route uses supabaseAdmin which authenticates with the service_role
-- key. We GRANT EXECUTE to service_role only.

create or replace function public.admin_list_app_users(
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  user_id              uuid,
  email                text,
  display_name         text,
  program_status       text,
  program_started_at   timestamptz,
  signed_up_at         timestamptz,
  total_count          bigint
)
language sql
security definer
set search_path = public, auth
as $$
  with current_program as (
    -- Most recent active/paused program per user.
    select distinct on (ps.user_id)
      ps.user_id,
      ps.status,
      ps.started_at
    from public.program_state ps
    where ps.status in ('active', 'paused')
    order by ps.user_id, ps.started_at desc
  ),
  joined as (
    select
      u.id            as user_id,
      u.email         as email,
      p.display_name  as display_name,
      cp.status       as program_status,
      cp.started_at   as program_started_at,
      u.created_at    as signed_up_at
    from current_program cp
    join auth.users u on u.id = cp.user_id
    left join public.profiles p on p.id = u.id
  )
  select
    j.user_id,
    j.email,
    j.display_name,
    j.program_status,
    j.program_started_at,
    j.signed_up_at,
    count(*) over () as total_count
  from joined j
  order by j.program_started_at desc nulls last, j.email asc
  limit  greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.admin_list_app_users(integer, integer) from public;
grant execute on function public.admin_list_app_users(integer, integer) to service_role;

-- To run this migration, paste the entire file into Supabase SQL editor for
-- the JustGetFit project (NOT outlawfighters) and run.
