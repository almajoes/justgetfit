import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/app-users?page=1&pageSize=25
 *
 * Returns the list of subscribers currently using the app — defined as
 * having a `program_state` row with status IN ('active', 'paused'). Most
 * recent active/paused program per user wins.
 *
 * Calls the `public.admin_list_app_users` RPC (defined in
 * db/migration_admin_list_app_users.sql) which does the cross-schema join
 * (auth.users + public.profiles + public.program_state) in a single query.
 * The RPC returns total_count on every row so we can paginate without a
 * second count query.
 *
 * Response:
 *   { ok: true,
 *     users: [{ user_id, email, display_name, program_status,
 *               program_started_at, signed_up_at }],
 *     total: number, page: number, pageSize: number }
 *
 * Auth: admin only (checkAdminAuth).
 */
export async function GET(req: NextRequest) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '25', 10) || 25));
  const offset = (page - 1) * pageSize;

  const { data, error } = await supabaseAdmin.rpc('admin_list_app_users', {
    p_limit: pageSize,
    p_offset: offset,
  });

  if (error) {
    // Most likely cause if this fires: the RPC migration hasn't been run.
    // Surface a hint so the next person doesn't have to dig through logs.
    const isMissingFn = /function .* does not exist/i.test(error.message);
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
    program_status: r.program_status as 'active' | 'paused',
    program_started_at: r.program_started_at as string | null,
    signed_up_at: r.signed_up_at as string,
  }));

  return NextResponse.json({ ok: true, users, total, page, pageSize });
}
