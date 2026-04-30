import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/subscribers/bulk-relabel
 *
 * Reassigns the `source` field (used as the group/label in the UI) on
 * many subscribers at once. Used for organizing existing subscribers
 * into groups after the fact.
 *
 * Body shape:
 *   { ids: string[], group_label: string }
 *
 * - `group_label` is stored in the existing `source` column. Empty string
 *   clears the label (sets it to NULL).
 * - Hard cap of 25,000 IDs per call.
 */
export async function POST(req: NextRequest) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: { ids?: unknown; group_label?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
  }

  const ids = body.ids.filter((id): id is string => typeof id === 'string');
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids must contain at least one string' }, { status: 400 });
  }
  if (ids.length > 25000) {
    return NextResponse.json({ error: 'Cannot relabel more than 25,000 at once' }, { status: 400 });
  }

  // Empty / whitespace label → clear it (NULL in DB). Otherwise trim + cap length.
  const label =
    typeof body.group_label === 'string' && body.group_label.trim()
      ? body.group_label.trim().slice(0, 80)
      : null;

  // Process in chunks of 1000 to stay under Postgres IN-clause limits
  let updated = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    const slice = ids.slice(i, i + 1000);
    const { data, error } = await supabaseAdmin
      .from('subscribers')
      .update({ source: label })
      .in('id', slice)
      .select('id');
    if (error) {
      return NextResponse.json(
        { error: `Update failed at batch ${Math.floor(i / 1000) + 1}: ${error.message}`, updated },
        { status: 500 }
      );
    }
    updated += data?.length ?? 0;
  }

  return NextResponse.json({ ok: true, updated, label });
}
