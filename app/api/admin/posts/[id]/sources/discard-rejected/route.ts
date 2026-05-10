import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Post, RejectedSource } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/posts/[id]/sources/discard-rejected
 *
 * Discard a rejected source — remove it from posts.rejected_sources
 * without adding it to sources. Use from the Sources admin page when
 * an admin reviews a rejection and confirms it's a true bad source.
 *
 * Body: { url: string }
 *
 * Counterpart to approve-rejected; both shrink the rejected_sources
 * list, just with different fates for the entry.
 */

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.url !== 'string' || !body.url) {
    return NextResponse.json({ error: 'Body must be { url: string }' }, { status: 400 });
  }
  const targetUrl = body.url;

  const { data: post, error: fetchErr } = await supabaseAdmin
    .from('posts')
    .select('id, rejected_sources')
    .eq('id', params.id)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const typedPost = post as Pick<Post, 'id' | 'rejected_sources'>;
  const currentRejected = (typedPost.rejected_sources ?? []) as RejectedSource[];
  const updatedRejected = currentRejected.filter((r) => r.url !== targetUrl);

  if (updatedRejected.length === currentRejected.length) {
    return NextResponse.json(
      { ok: true, note: `URL not found in rejected_sources (already discarded?): ${targetUrl}` }
    );
  }

  const { error: updateErr } = await supabaseAdmin
    .from('posts')
    .update({ rejected_sources: updatedRejected })
    .eq('id', typedPost.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, discardedUrl: targetUrl });
}
