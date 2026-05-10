import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Per-author endpoints.
 *   PATCH  — update fields (partial, only sent fields are touched)
 *   DELETE — remove the author. FK on posts/drafts is ON DELETE SET NULL,
 *            so any posts that bylined them fall back to the editor_credit.
 */

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (typeof body.slug === 'string') {
    const slug = body.slug.trim().toLowerCase();
    if (!slug || !SLUG_REGEX.test(slug)) {
      return NextResponse.json(
        { error: 'slug must be lowercase letters, numbers, and dashes only' },
        { status: 400 }
      );
    }
    update.slug = slug;
  }
  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    update.name = name;
  }
  if ('bio' in body) update.bio = ((body.bio as string) || '').trim() || null;
  if ('photo_url' in body) update.photo_url = ((body.photo_url as string) || '').trim() || null;
  if ('photo_credit' in body) update.photo_credit = ((body.photo_credit as string) || '').trim() || null;
  if (typeof body.sort_order === 'number') update.sort_order = body.sort_order;
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active;

  // Photo + credit invariant — enforced server-side. We compute the final
  // values by merging the update with the current row so the check is
  // accurate even when the admin is only updating one of the two fields.
  if ('photo_url' in update || 'photo_credit' in update) {
    const { data: current } = await supabaseAdmin
      .from('authors')
      .select('photo_url, photo_credit')
      .eq('id', params.id)
      .maybeSingle();
    const finalPhoto = 'photo_url' in update ? update.photo_url : current?.photo_url;
    const finalCredit = 'photo_credit' in update ? update.photo_credit : current?.photo_credit;
    if (finalPhoto && !finalCredit) {
      return NextResponse.json(
        { error: 'photo_credit is required when photo_url is set (Unsplash license terms).' },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from('authors')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    if (/duplicate key/i.test(error.message)) {
      return NextResponse.json({ error: 'Slug is already taken by another author.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, author: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  const { error } = await supabaseAdmin.from('authors').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
