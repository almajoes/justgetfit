import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/app-users?page=1&pageSize=25&filter=all
 *
 * Returns the list of app users (anyone with a row in `profiles` — i.e. at
 * least started onboarding). For each user the response includes the
 * most-recent program's status & start date (if any), the
 * completed_onboarding flag, signup date, email, and display name.
 *
 * Filter values:
 *   - all                  — every profile row (default)
 *   - active               — most-recent program is active
 *   - paused               — most-recent program is paused
 *   - onboarded_no_program — finished onboarding but has no active/paused program
 *   - incomplete           — started onboarding but completed_onboarding = false
 *
 * Calls the `public.admin_list_app_users` RPC (defined in
 * db/migration_admin_list_app_users.sql) which does the cross-schema join
 * and the filtering in a single query. The RPC returns total_count for the
 * filtered set on every row so we can paginate without a second count query.
 *
 * Auth: admin only (checkAdminAuth).
 */

const ALLOWED_FILTERS = new Set(['all', 'active', 'paused', 'onboarded_no_program', 'incomplete']);

export async function GET(req: NextRequest) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '25', 10) || 25));
  const offset = (page - 1) * pageSize;

  const filterParam = (url.searchParams.get('filter') || 'all').toLowerCase();
  const filter = ALLOWED_FILTERS.has(filterParam) ? filterParam : 'all';

  const { data, error } = await supabaseAdmin.rpc('admin_list_app_users', {
    p_limit: pageSize,
    p_offset: offset,
    p_filter: filter,
  });

  if (error) {
    // Most likely cause if this fires: the RPC migration hasn't been run.
    // Surface a hint so the next person doesn't have to dig through logs.
    // Match BOTH wordings: Postgres-direct ("function ... does not exist")
    // and PostgREST-via-Supabase ("Could not find the function ... in the
    // schema cache").
    const msg = error.message || '';
    const isMissingFn =
      /function .* does not exist/i.test(msg) ||
      /could not find the function/i.test(msg) ||
      /schema cache/i.test(msg);
    return NextResponse.json(
      {
        error: error.message,
        hint: isMissingFn
          ? 'Run db/migration_admin_list_app_users.sql in the JustGetFit Supabase SQL editor to create the admin_list_app_users RPC.'
          : undefined,
      },
      { status: 500 }
    );
  }

  // Total count is identical on every row of the RPC result; pull it from
  // the first row, default to 0 when result is empty.
  const total = data && data.length > 0 ? Number((data[0] as any).total_count) : 0;
  const users = (data || []).map((r: any) => ({
    user_id: r.user_id as string,
    email: r.email as string,
    display_name: (r.display_name as string | null) ?? null,
    completed_onboarding: !!r.completed_onboarding,
    program_status: (r.program_status as string | null) ?? null,
    program_started_at: r.program_started_at as string | null,
    signed_up_at: r.signed_up_at as string,
  }));

  return NextResponse.json({ ok: true, users, total, page, pageSize, filter });
}
