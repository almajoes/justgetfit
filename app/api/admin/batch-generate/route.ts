import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateDraft } from '@/lib/anthropic';
import { searchUnsplash } from '@/lib/unsplash';
import { pickNextAuthor } from '@/lib/authors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/batch-generate
 *
 * Generates a single draft article from the topic queue and inserts it into
 * the drafts table. The client invokes this once per draft requested in a
 * batch (so a "generate 5 drafts" run is 5 sequential POSTs).
 *
 * Body (all optional):
 *   - topicId: string  — if provided, use this exact topic (must be in the
 *                        topics table and not yet used). If omitted, picks a
 *                        random unused topic from the queue (legacy behavior).
 *
 * The topicId path is what powers the "choose topics" UX on
 * /admin/generate — the client passes one selected topic ID per call so
 * each draft maps to a specific picked topic.
 */
export async function POST(req: NextRequest) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  // Parse body defensively — empty body, malformed JSON, etc. all collapse
  // to "no topicId" → random pick.
  let topicId: string | null = null;
  try {
    const body = await req.json().catch(() => null);
    if (body && typeof body.topicId === 'string' && body.topicId.length > 0) {
      topicId = body.topicId;
    }
  } catch {
    // ignore — fall through to random pick
  }

  try {
    let topic: { id: string; title: string; category: string; angle: string | null } | null = null;

    if (topicId) {
      // Targeted pick: fetch the specific topic and verify it's unused.
      // Race-safety: the unused-check is best-effort here; the final
      // mark-as-used UPDATE below is what actually claims the topic. If
      // two concurrent calls target the same topic, both will get drafts
      // generated but both will set used_at to (effectively) the same
      // timestamp — harmless, just a duplicate the admin can delete.
      const { data, error } = await supabaseAdmin
        .from('topics')
        .select('id, title, category, angle, used_at')
        .eq('id', topicId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
      }
      if (data.used_at) {
        return NextResponse.json(
          { error: 'Topic has already been used. Refresh the page to see the latest queue.' },
          { status: 409 }
        );
      }
      topic = data;
    } else {
      // Random pick: pull up to 50 unused topics and choose one. Matches
      // the prior behavior so existing call sites that don't pass topicId
      // keep working.
      const { data: topics } = await supabaseAdmin
        .from('topics')
        .select('id, title, category, angle')
        .is('used_at', null)
        .limit(50);
      if (!topics || topics.length === 0) {
        return NextResponse.json({ error: 'No unused topics' }, { status: 400 });
      }
      topic = topics[Math.floor(Math.random() * topics.length)];
    }

    if (!topic) {
      // Defensive — should be unreachable since both branches above either
      // assign topic or return early.
      return NextResponse.json({ error: 'No topic resolved' }, { status: 500 });
    }

    const generated = await generateDraft({
      title: topic.title,
      category: topic.category,
      angle: topic.angle,
    });
    const photo = await searchUnsplash(generated.imageKeywords);

    let slug = generated.slug;
    let suffix = 1;
    while (true) {
      const [{ data: postHit }, { data: draftHit }] = await Promise.all([
        supabaseAdmin.from('posts').select('id').eq('slug', slug).maybeSingle(),
        supabaseAdmin.from('drafts').select('id').eq('slug', slug).maybeSingle(),
      ]);
      if (!postHit && !draftHit) break;
      suffix += 1;
      slug = `${generated.slug}-${suffix}`;
      if (suffix > 50) throw new Error('Slug collision');
    }

    // Pick the next author from the round-robin rotation. If no authors
    // are configured (shouldn't happen post-migration), the draft gets
    // null author_id and the byline falls back to plain "Just Get Fit
    // Editorial" at render time. editor_credit always defaults to that
    // anyway via the column default — we omit it from the insert so the
    // database default applies.
    const author = await pickNextAuthor();

    const { data: draft, error } = await supabaseAdmin
      .from('drafts')
      .insert({
        title: generated.title,
        slug,
        excerpt: generated.excerpt,
        content: generated.content,
        category: generated.category,
        cover_image_url: photo?.url ?? null,
        cover_image_credit: photo?.credit ?? null,
        topic_id: topic.id,
        status: 'pending',
        generation_model: generated.model,
        generation_notes: `Batch-generated ${new Date().toISOString()}`,
        author_id: author?.id ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    await supabaseAdmin.from('topics').update({ used_at: new Date().toISOString() }).eq('id', topic.id);

    return NextResponse.json({ ok: true, draftId: draft.id, title: draft.title });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Generation failed';
    console.error('Batch generate failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
