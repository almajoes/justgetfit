import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Post, Source } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/admin/posts/[id]/sources/[n]
 *
 * Remove a single source from posts.sources by its `n` value. After
 * deletion, the remaining sources are renumbered 1..K so the public
 * Sources section stays sequential with no gaps.
 *
 * Returns: { ok: true, sources: Source[] } — the updated sources list
 * so the caller can update local state without an extra fetch.
 *
 * Why renumber: a public-facing Sources section with [1] [3] [4]
 * (skipping [2]) reads as broken. Sequential 1..K matches reader
 * expectation. Body content doesn't reference these numbers since the
 * pipeline doesn't insert [N] markers, so renumbering is a pure UI
 * concern with no anchor consequences.
 */

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; n: string } }
) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  const targetN = parseInt(params.n, 10);
  if (!Number.isFinite(targetN) || targetN < 1) {
    return NextResponse.json({ error: 'Invalid source number' }, { status: 400 });
  }

  const { data: post, error: fetchErr } = await supabaseAdmin
    .from('posts')
    .select('id, sources')
    .eq('id', params.id)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const typedPost = post as Pick<Post, 'id' | 'sources'>;
  const current = (typedPost.sources ?? []) as Source[];

  const idx = current.findIndex((s) => s.n === targetN);
  if (idx < 0) {
    return NextResponse.json(
      { error: `Source [${targetN}] not found on this post` },
      { status: 404 }
    );
  }

  // Remove + renumber. Sort by current n first to preserve relative
  // order, then reassign sequential n = 1..K.
  const remaining = current.filter((_, i) => i !== idx);
  remaining.sort((a, b) => a.n - b.n);
  const renumbered: Source[] = remaining.map((s, i) => ({ ...s, n: i + 1 }));

  const { error: updateErr } = await supabaseAdmin
    .from('posts')
    .update({ sources: renumbered })
    .eq('id', typedPost.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sources: renumbered });
}
