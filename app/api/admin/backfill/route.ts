import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateDraft, readingMinutes } from '@/lib/anthropic';
import { searchUnsplash } from '@/lib/unsplash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Backfill endpoint.
 *
 * Generates ONE article from the topic queue and AUTO-PUBLISHES it directly to
 * the `posts` table with a backdated `published_at` timestamp.
 *
 * The caller is expected to loop this endpoint, one call per article, passing
 * a 0-indexed `weeks_ago` value:
 *   - weeks_ago=0  → last Monday at 9 AM Eastern
 *   - weeks_ago=1  → previous Monday
 *   - weeks_ago=N  → N Mondays before "last Monday"
 *
 * This is one-shot infrastructure for seeding the site at launch. After
 * backfill, use the regular cron + draft-review flow.
 */
export async function POST(req: NextRequest) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: { weeks_ago?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const weeksAgo = Math.max(0, Math.floor(Number(body.weeks_ago ?? 0)));

  try {
    const { data: topics } = await supabaseAdmin
      .from('topics')
      .select('*')
      .is('used_at', null)
      .limit(100);

    if (!topics || topics.length === 0) {
      return NextResponse.json({ error: 'No unused topics in queue' }, { status: 400 });
    }

    const topic = topics[Math.floor(Math.random() * topics.length)];

    const generated = await generateDraft({
      title: topic.title,
      category: topic.category,
      angle: topic.angle,
    });

    const photo = await searchUnsplash(generated.imageKeywords);

    // Resolve slug collisions across both posts and drafts
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

    const publishedAt = computeBackdatedMonday(weeksAgo);

    // Create the draft record (so we have an audit trail), marked as approved
    const { data: draft, error: draftError } = await supabaseAdmin
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
        status: 'approved',
        generation_model: generated.model,
        generation_notes: `Backfill (weeks_ago=${weeksAgo}, published_at=${publishedAt.toISOString()})`,
      })
      .select()
      .single();
    if (draftError) throw draftError;

    // Insert directly into posts with backdated timestamp
    const { data: post, error: postError } = await supabaseAdmin
      .from('posts')
      .insert({
        title: generated.title,
        slug,
        excerpt: generated.excerpt,
        content: generated.content,
        category: generated.category,
        cover_image_url: photo?.url ?? null,
        cover_image_credit: photo?.credit ?? null,
        draft_id: draft.id,
        read_minutes: readingMinutes(generated.content),
        published_at: publishedAt.toISOString(),
      })
      .select()
      .single();
    if (postError) throw postError;

    // Mark the topic as used
    await supabaseAdmin
      .from('topics')
      .update({ used_at: new Date().toISOString() })
      .eq('id', topic.id);

    return NextResponse.json({
      ok: true,
      postId: post.id,
      slug: post.slug,
      title: post.title,
      published_at: post.published_at,
      weeks_ago: weeksAgo,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Backfill generation failed';
    console.error('Backfill failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Returns a Date for "N Mondays before the most recent past Monday at 9 AM US/Eastern."
 *
 * weeks_ago=0 = the most recent Monday that already passed, at 9 AM ET.
 *
 * Implementation: get current UTC time, walk back to most recent Monday
 * (treating Monday as weekday 1), set the time to 13:00 UTC (= 9 AM EDT).
 * This is "good enough for backfill" — within an hour of the right moment
 * regardless of which side of DST you're on.
 */
function computeBackdatedMonday(weeksAgo: number): Date {
  const now = new Date();
  // Day of week in UTC: 0=Sunday, 1=Monday, ..., 6=Saturday
  const utcDay = now.getUTCDay();
  // Days to subtract to land on the most recent past Monday (or today, if today is Monday and 9 AM ET has already passed).
  // For backfill we want the previous Monday no matter what — so always subtract at least 7 days from today's Monday.
  let daysSinceLastMonday = (utcDay + 6) % 7; // 0 if today is Mon, 6 if today is Tue, etc.
  if (daysSinceLastMonday === 0) {
    // Today is a Monday — treat the most recent fully-past Monday as 7 days ago
    daysSinceLastMonday = 7;
  }
  const result = new Date(now);
  result.setUTCDate(result.getUTCDate() - daysSinceLastMonday - weeksAgo * 7);
  result.setUTCHours(13, 0, 0, 0); // 13:00 UTC ≈ 9 AM EDT
  return result;
}
