import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateDraft, generateTopics } from '@/lib/anthropic';
import { searchUnsplash } from '@/lib/unsplash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// When unused topic count drops to this threshold, auto-generate more
const TOPIC_REFILL_THRESHOLD = 8;
const TOPIC_REFILL_BATCH_SIZE = 12;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Idempotency guard — prevent duplicate drafts when:
  //   - Vercel cron fires late (e.g. 13:00 UTC scheduled, fires 14:15 UTC)
  //     after a manual trigger had already generated this week's draft
  //   - Vercel cron fires twice in the same window (rare platform glitch)
  //   - An admin manually triggers the route twice in quick succession
  //
  // Window: 12 hours. Long enough to catch "manual + late cron" same-day,
  // short enough that a legitimate retry next Monday isn't blocked by a
  // stale draft from the previous week.
  //
  // Bypass: append ?force=1 to the URL to skip this check (useful when an
  // admin DELIBERATELY wants a second draft, or wants to retry after a
  // failed generation that produced a half-broken draft they'll delete).
  const force = request.nextUrl.searchParams.get('force') === '1';
  if (!force) {
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { count: recentDrafts, error: guardError } = await supabaseAdmin
      .from('drafts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since);

    if (guardError) {
      // If we can't check, fail closed and don't generate — better to skip
      // a draft than risk a duplicate.
      console.error('[cron] Idempotency check failed:', guardError);
      return NextResponse.json(
        { ok: false, error: 'Idempotency check failed', message: guardError.message },
        { status: 500 }
      );
    }

    if ((recentDrafts ?? 0) > 0) {
      console.log(`[cron] Skipping draft generation — ${recentDrafts} draft(s) created in the last 12h.`);
      return NextResponse.json({
        ok: true,
        skipped: true,
        message: `A draft was already created in the last 12 hours (${recentDrafts} found). Use ?force=1 to bypass.`,
        recentDraftCount: recentDrafts,
      });
    }
  }

  const result: {
    ok: boolean;
    draftId?: string;
    title?: string;
    coverImage?: string | null;
    reviewUrl?: string;
    topicsRefilled?: number;
    error?: string;
    message?: string;
  } = { ok: false };

  // STEP 1: Try to generate this week's draft from the topic queue
  try {
    const { data: initialTopics } = await supabaseAdmin
      .from('topics')
      .select('*')
      .is('used_at', null)
      .limit(50);

    let topics = initialTopics ?? [];

    if (topics.length === 0) {
      // No topics — try to refill before giving up
      console.log('[cron] No topics in queue, attempting to refill before draft generation');
      const refilled = await refillTopics();
      if (refilled === 0) {
        return NextResponse.json({
          ok: false,
          message: 'No unused topics and topic refill failed.',
        });
      }
      result.topicsRefilled = refilled;
      // Re-fetch
      const { data: freshTopics } = await supabaseAdmin
        .from('topics')
        .select('*')
        .is('used_at', null)
        .limit(50);
      if (!freshTopics || freshTopics.length === 0) {
        return NextResponse.json({ ok: false, message: 'Refilled but still no topics found.' });
      }
      topics = freshTopics;
    }

    const topic = topics[Math.floor(Math.random() * topics.length)];

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
      if (suffix > 50) throw new Error('Could not generate unique slug');
    }

    const { data: draft, error: insertError } = await supabaseAdmin
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
        generation_notes: `Auto-generated from topic "${topic.title}" on ${new Date().toISOString()}`,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    await supabaseAdmin
      .from('topics')
      .update({ used_at: new Date().toISOString() })
      .eq('id', topic.id);

    result.ok = true;
    result.draftId = draft.id;
    result.title = draft.title;
    result.coverImage = photo?.url ?? null;
    result.reviewUrl = `/admin/drafts/${draft.id}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[cron] Draft generation failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  // STEP 2: After draft generation, check if topic queue is running low and replenish if so
  // This runs in addition to STEP 1, so the cron always (a) drafts an article and (b) keeps queue stocked
  try {
    const { count: unusedCount } = await supabaseAdmin
      .from('topics')
      .select('*', { count: 'exact', head: true })
      .is('used_at', null);

    if ((unusedCount ?? 0) < TOPIC_REFILL_THRESHOLD) {
      console.log(`[cron] Unused topics low (${unusedCount}), refilling`);
      const refilled = await refillTopics();
      result.topicsRefilled = (result.topicsRefilled ?? 0) + refilled;
    }
  } catch (err) {
    // Don't fail the entire cron if just the refill fails — the draft was already created
    console.error('[cron] Topic refill failed (draft was still created):', err);
  }

  return NextResponse.json(result);
}

/**
 * Generate fresh topics and insert them into the topics table.
 * Returns the number of topics inserted.
 */
async function refillTopics(): Promise<number> {
  const { data: existingTopics } = await supabaseAdmin.from('topics').select('title');
  const existingTitles = (existingTopics || []).map((t) => t.title as string);

  const topics = await generateTopics({
    count: TOPIC_REFILL_BATCH_SIZE,
    existingTitles,
  });

  const rows = topics.map((t) => ({
    title: t.title,
    category: t.category,
    angle: t.angle,
  }));

  const { data: inserted, error } = await supabaseAdmin
    .from('topics')
    .insert(rows)
    .select();

  if (error) {
    console.error('[cron] Topic insert failed:', error);
    return 0;
  }

  return inserted?.length ?? 0;
}
