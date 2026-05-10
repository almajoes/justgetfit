import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { addCitationsToPost } from '@/lib/citations';
import type { Post } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Web search + verification + parsing can comfortably run 30-90s. Vercel
// Pro plans allow up to 300s (5 min) on serverless. Free tier caps at 60s,
// which is too tight for ~5 web searches + per-source verification fetches.
// Set to 300 — works on Pro, falls back gracefully on Free (the request
// gets cut off and the admin sees a timeout error).
export const maxDuration = 300;

/**
 * POST /api/admin/posts/[id]/citations
 *
 * Add citations to an existing post. Reads the post body, runs the
 * citation generation pipeline (web_search + verification), and stores
 * the result on the post row.
 *
 * Behavior:
 *   - If post already has non-empty sources: skips by default. Pass
 *     ?force=1 to overwrite.
 *   - On success: updates posts.content with [N] markers and posts.sources
 *     with the verified source list. Returns the stats and updated row.
 *   - On no-good-sources outcome: leaves posts.content unchanged, sets
 *     posts.sources = [] (empty array, not null) to mark "we tried".
 *     Returns ok: true with stats.verified = 0.
 *   - On error: returns 500 with the error message.
 *
 * NO UI for this yet — call it via curl during testing:
 *
 *   curl -X POST \
 *     -H "Authorization: Bearer $ADMIN_TOKEN" \
 *     https://justgetfit.org/api/admin/posts/<post-id>/citations
 */

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';

  // Fetch the post
  const { data: post, error: fetchErr } = await supabaseAdmin
    .from('posts')
    .select('id, title, slug, category, content, sources')
    .eq('id', params.id)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  // Skip-if-already-cited unless force
  const typedPost = post as Pick<Post, 'id' | 'title' | 'slug' | 'category' | 'content' | 'sources'>;
  if (!force && Array.isArray(typedPost.sources) && typedPost.sources.length > 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Post already has ${typedPost.sources.length} sources. Pass ?force=1 to overwrite.`,
      sources: typedPost.sources,
    });
  }

  console.log(`[citations] Starting for post ${typedPost.id} (${typedPost.slug})`);
  const t0 = Date.now();

  const result = await addCitationsToPost({
    id: typedPost.id,
    title: typedPost.title,
    category: typedPost.category,
    content: typedPost.content,
  });

  const elapsedMs = Date.now() - t0;
  console.log(`[citations] Finished in ${elapsedMs}ms`);

  if (!result.ok) {
    return NextResponse.json({ error: result.error, elapsedMs }, { status: 500 });
  }

  // Persist to DB. Even when verified === 0 we set sources = [] (not null)
  // so the next run knows we tried and can skip without re-spending API
  // dollars. Force run can still overwrite.
  const { error: updateErr } = await supabaseAdmin
    .from('posts')
    .update({
      content: result.updatedContent,
      sources: result.sources,
    })
    .eq('id', typedPost.id);

  if (updateErr) {
    return NextResponse.json({ error: `DB update failed: ${updateErr.message}`, stats: result.stats }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    skipped: false,
    elapsedMs,
    stats: result.stats,
    sources: result.sources,
    contentChanged: result.updatedContent !== typedPost.content,
    contentLength: result.updatedContent.length,
  });
}
