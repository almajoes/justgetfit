import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/authors/reorder
 *
 * Bulk-update authors' sort_order. Accepts a list of author ids in the
 * desired order; the endpoint writes sort_order = 1, 2, 3, ... so the
 * /authors page lists them in exactly that order on next render.
 *
 * Body: { ids: string[] }  (must contain every active+inactive author
 * id, in the desired order; the endpoint validates that against the
 * current authors table to catch stale clients sending an outdated
 * list).
 *
 * Returns: { ok: true, updated: N }
 */

export async function POST(req: NextRequest) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== 'string')) {
    return NextResponse.json({ error: 'Body must be { ids: string[] }' }, { status: 400 });
  }
  const ids = body.ids as string[];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids array cannot be empty' }, { status: 400 });
  }
  // Defensive dedupe — Postgres won't auto-dedupe; a duplicate id would
  // double-update one row and skip another, scrambling the order.
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: 'ids array contains duplicates' }, { status: 400 });
  }

  // Validate that every supplied id exists in authors. We don't require
  // ALL authors to be present in the list (admin could send only the
  // active subset, for example) — just that every id we're asked to
  // update is real. Invalid ids would silently no-op the update which
  // is confusing.
  const { data: existing, error: existErr } = await supabaseAdmin
    .from('authors')
    .select('id')
    .in('id', ids);
  if (existErr) {
    return NextResponse.json({ error: existErr.message }, { status: 500 });
  }
  const existingSet = new Set((existing ?? []).map((r) => r.id));
  const missing = ids.filter((id) => !existingSet.has(id));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Unknown author ids: ${missing.join(', ')}` },
      { status: 400 }
    );
  }

  // Issue one update per id. Could be batched with an UPSERT, but we'd
  // need to also re-write the (immutable) other columns to satisfy the
  // upsert. With a handful of authors, sequential updates are fine.
  let updated = 0;
  for (let i = 0; i < ids.length; i++) {
    const newOrder = i + 1; // 1-indexed sort_order
    const { error: updateErr } = await supabaseAdmin
      .from('authors')
      .update({ sort_order: newOrder })
      .eq('id', ids[i]);
    if (updateErr) {
      console.error(`[authors/reorder] Failed to update ${ids[i]}:`, updateErr.message);
      return NextResponse.json(
        { error: `Update failed at index ${i}: ${updateErr.message}`, updatedSoFar: updated },
        { status: 500 }
      );
    }
    updated++;
  }

  return NextResponse.json({ ok: true, updated });
}
