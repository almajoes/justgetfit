import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { readingMinutes } from '@/lib/anthropic';
import { createEmailJob, triggerWorker } from '@/lib/email-jobs';
import { buildThrottleExclusions } from '@/lib/throttle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Job creation is fast; 30s is plenty.
export const maxDuration = 30;

/**
 * POST /api/admin/drafts/[id]
 *
 * Save / publish / reject a draft. On publish with `send_newsletter: true`, we
 * ENQUEUE a newsletter job (no longer blasting synchronously). The publish
 * response includes a job_id the client can poll for progress.
 *
 * Audience selection (NEW): when publishing, the client may pass an `audience`
 * shape — same as the broadcast API:
 *   audience: { mode: 'all' }                   → all confirmed subscribers
 *   audience: { mode: 'list', subscriber_ids }  → just the listed ids
 *   audience: undefined  (or send_newsletter:false) → no blast
 *
 * Server ALWAYS filters to status='confirmed' regardless of submitted IDs
 * (defense in depth — buggy/malicious clients can't reach unsubscribed/bounced).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: {
    action: 'save' | 'publish' | 'reject';
    title: string;
    slug: string;
    excerpt: string;
    category: string;
    content: string;
    cover_image_url?: string | null;
    cover_image_credit?: string | null;
    send_newsletter?: boolean;
    audience?: { mode: 'all' } | { mode: 'list'; subscriber_ids: string[] };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    action, title, slug, excerpt, category, content,
    cover_image_url, cover_image_credit, send_newsletter, audience,
  } = body;

  if (!action || !['save', 'publish', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  if (action !== 'reject' && (!title?.trim() || !slug?.trim() || !content?.trim())) {
    return NextResponse.json({ error: 'Title, slug, and content are required.' }, { status: 400 });
  }

  try {
    if (action === 'reject') {
      await supabaseAdmin.from('drafts').update({ status: 'rejected' }).eq('id', params.id);
      return NextResponse.json({ ok: true });
    }

    await supabaseAdmin
      .from('drafts')
      .update({
        title: title.trim(),
        slug: slug.trim(),
        excerpt: excerpt?.trim() || null,
        category: category?.trim() || null,
        content,
        cover_image_url: cover_image_url || null,
        cover_image_credit: cover_image_credit || null,
      })
      .eq('id', params.id);

    if (action === 'save') return NextResponse.json({ ok: true });

    // ─── Publish ──────────────────────────────────────────────────────
    const { data: existing } = await supabaseAdmin
      .from('posts')
      .select('id')
      .eq('slug', slug.trim())
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: `Slug "${slug}" is already used. Change the slug and try again.` },
        { status: 409 }
      );
    }

    const { data: post, error: insertError } = await supabaseAdmin
      .from('posts')
      .insert({
        title: title.trim(),
        slug: slug.trim(),
        excerpt: excerpt?.trim() || null,
        category: category?.trim() || null,
        content,
        cover_image_url: cover_image_url || null,
        cover_image_credit: cover_image_credit || null,
        draft_id: params.id,
        read_minutes: readingMinutes(content),
        published_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insertError) throw insertError;

    await supabaseAdmin.from('drafts').update({ status: 'approved' }).eq('id', params.id);

    revalidatePath('/');
    revalidatePath('/articles');
    if (post.category) {
      revalidatePath(`/articles/${post.category}/${post.slug}`);
      revalidatePath(`/articles/${post.category}`);
    }

    // ─── Newsletter blast (now async via job system) ──────────────────
    let newsletter: { job_id: string; send_id: string; total_recipients: number } | null = null;

    if (send_newsletter) {
      // Resolve recipient IDs based on audience selection. Default to 'all' if
      // no audience passed (backward-compatible with older clients).
      const audienceMode = audience?.mode === 'list' ? 'list' : 'all';
      const audienceIds = audience?.mode === 'list' ? audience.subscriber_ids : null;

      const recipientIds = await resolveRecipientIds(audienceMode, audienceIds);
      if (recipientIds.length > 0) {
        newsletter = await enqueueNewsletterJob(post.id, post.title, recipientIds);
      }
    }

    return NextResponse.json({
      ok: true,
      postSlug: post.slug,
      postCategory: post.category,
      postId: post.id,
      newsletter,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error(`Draft action ${action} failed:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Resolve audience selection to a list of confirmed-subscriber UUIDs.
 *
 * mode='all': page through all confirmed subscribers
 * mode='list': intersect the supplied IDs with confirmed-status subscribers
 *              (chunks the .in() query to keep URLs under ~8KB)
 *
 * THROTTLE (May 2026 update — twice-weekly cadence):
 *   Applied AFTER the audience is resolved. Excludes subscribers with
 *   source='import' AND >= 2 sent events in the past 7 rolling days.
 *   Form-subscribers and any custom-source-label subscribers are exempt.
 *   See lib/throttle.ts for the policy and rationale. Broadcasts use a
 *   separate code path and are NOT throttled — that's intentional.
 */
async function resolveRecipientIds(
  mode: 'all' | 'list',
  suppliedIds: string[] | null
): Promise<string[]> {
  const PAGE = 1000;
  // First pass: resolve to confirmed subscribers + their email/source so we
  // can run the throttle check against email_events.
  const resolved: { id: string; email: string; source: string | null }[] = [];

  if (mode === 'list' && suppliedIds) {
    const ids = suppliedIds.filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) return [];
    const URL_CHUNK = 200; // 200 * 36 chars ≈ 7.2KB, safely under URL limits
    for (let i = 0; i < ids.length; i += URL_CHUNK) {
      const chunk = ids.slice(i, i + URL_CHUNK);
      const { data, error } = await supabaseAdmin
        .from('subscribers')
        .select('id, email, source')
        .eq('status', 'confirmed')
        .in('id', chunk);
      if (error) {
        console.error('[publish] recipient lookup failed:', error.message);
        return [];
      }
      for (const row of (data as { id: string; email: string; source: string | null }[]) || []) {
        resolved.push(row);
      }
    }
  } else {
    // mode === 'all'
    let from = 0;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from('subscribers')
        .select('id, email, source')
        .eq('status', 'confirmed')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        console.error('[publish] recipient lookup failed:', error.message);
        return [];
      }
      const batch = (data as { id: string; email: string; source: string | null }[]) || [];
      for (const row of batch) resolved.push(row);
      if (batch.length < PAGE) break;
      from += PAGE;
      if (from > 200000) break; // safety bail
    }
  }

  // Apply throttle: filter out the import-source subs over the cap.
  const exclusions = await buildThrottleExclusions(resolved);
  return resolved.filter((s) => !exclusions.has(s.id)).map((s) => s.id);
}

/**
 * Create newsletter_sends + email_jobs rows, kick the worker.
 * Returns identifiers for client polling, or null on any failure.
 */
async function enqueueNewsletterJob(
  postId: string,
  postTitle: string,
  ids: string[]
): Promise<{ job_id: string; send_id: string; total_recipients: number } | null> {
  if (ids.length === 0) return null;

  const { data: sendRow } = await supabaseAdmin
    .from('newsletter_sends')
    .insert({
      post_id: postId,
      kind: 'post',
      status: 'sending',
      recipient_count: ids.length,
      failed_count: 0,
    })
    .select()
    .single();

  if (!sendRow) return null;

  const jobResult = await createEmailJob({
    kind: 'newsletter',
    subject: postTitle,
    postId,
    sendId: sendRow.id,
    subscriberIds: ids,
  });

  if (!jobResult.ok) return null;

  await triggerWorker(jobResult.job.id);

  return {
    job_id: jobResult.job.id,
    send_id: sendRow.id,
    total_recipients: ids.length,
  };
}
