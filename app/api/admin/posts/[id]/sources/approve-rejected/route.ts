import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Post, Source, RejectedSource } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/posts/[id]/sources/approve-rejected
 *
 * Manually approve a previously-rejected source. Used from the Sources
 * admin page when an admin reviews a rejection (e.g., 404 false positive,
 * paywall the admin trusts) and decides to keep it.
 *
 * Body: { url: string }  (the URL of the rejected source to approve)
 *
 * Approval moves the source from posts.rejected_sources into
 * posts.sources, assigning it the next sequential `n`. We do NOT
 * insert a [N] marker in the body — Claude didn't tell us where it
 * intended to anchor it, and inserting blind would corrupt prose. The
 * admin can manually add a marker by editing the body if they want it
 * inline; otherwise it shows up as a "Further reading" entry in the
 * Sources section.
 *
 * Idempotent: approving an already-approved source is a no-op (the
 * URL doesn't appear in rejected_sources, so nothing to move).
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

  // Fetch the post's current sources + rejected_sources
  const { data: post, error: fetchErr } = await supabaseAdmin
    .from('posts')
    .select('id, sources, rejected_sources')
    .eq('id', params.id)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const typedPost = post as Pick<Post, 'id' | 'sources' | 'rejected_sources'>;
  const currentSources = (typedPost.sources ?? []) as Source[];
  const currentRejected = (typedPost.rejected_sources ?? []) as RejectedSource[];

  // Find the rejected source by URL.
  const idx = currentRejected.findIndex((r) => r.url === targetUrl);
  if (idx < 0) {
    return NextResponse.json(
      { error: `URL not found in rejected_sources for this post: ${targetUrl}` },
      { status: 404 }
    );
  }
  const approving = currentRejected[idx];

  // Compute next n. Sources may have gaps if some were renumbered, but
  // taking max+1 always produces a unique number.
  const nextN = currentSources.reduce((max, s) => Math.max(max, s.n), 0) + 1;

  const newSource: Source = {
    n: nextN,
    title: approving.title,
    url: approving.url,
    publication: approving.publication,
    quote: approving.quote,
    accessed_at: new Date().toISOString(),
  };

  const updatedSources = [...currentSources, newSource];
  const updatedRejected = currentRejected.filter((_, i) => i !== idx);

  const { error: updateErr } = await supabaseAdmin
    .from('posts')
    .update({
      sources: updatedSources,
      rejected_sources: updatedRejected,
    })
    .eq('id', typedPost.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    approved: newSource,
    note: 'Source added to the Sources list. NO [N] marker was inserted in the body — the source will appear as a "Further reading" entry. To anchor it inline, edit the post and add a [' + nextN + '] marker where you want it.',
  });
}
