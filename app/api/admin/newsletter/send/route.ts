import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createEmailJob, triggerWorker } from '@/lib/email-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/admin/newsletter/send
 *   body: {
 *     postId: string,
 *     audience?: { mode: 'all' } | { mode: 'list', subscriber_ids: string[] }
 *   }
 *
 * Manually re-blast an already-published post. Used as an admin escape hatch —
 * does NOT track who already received the post; calling this for a post that
 * already had a successful send will email everyone again (filtered by audience).
 *
 * Backward-compatible: omitting `audience` defaults to mode='all' (the previous
 * behavior). New callers (the Re-send panel on the send-detail view + the post
 * editor) pass an explicit audience to support sample sends, group filters, etc.
 *
 * Like the publish path, this enqueues a job and returns immediately with a
 * job_id the client can poll.
 */
export async function POST(req: NextRequest) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: {
    postId?: string;
    audience?: { mode: 'all' } | { mode: 'list'; subscriber_ids: string[] };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const postId = String(body.postId || '');
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

  const { data: post } = await supabaseAdmin
    .from('posts')
    .select('id, title')
    .eq('id', postId)
    .maybeSingle();
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  // Resolve audience → subscriber IDs (always re-filtered to status='confirmed').
  const audienceMode = body.audience?.mode === 'list' ? 'list' : 'all';
  const suppliedIds =
    body.audience?.mode === 'list' ? body.audience.subscriber_ids : null;

  const ids = await resolveRecipientIds(audienceMode, suppliedIds);

  if (ids.length === 0) {
    return NextResponse.json({
      ok: true,
      total_recipients: 0,
      message:
        audienceMode === 'list'
          ? 'No matching confirmed subscribers found for the selected IDs.'
          : 'No confirmed subscribers — nothing sent.',
    });
  }

  const { data: sendRow } = await supabaseAdmin
    .from('newsletter_sends')
    .insert({
      post_id: postId,
      kind: 'post',
      status: 'sending',
      recipient_count: ids.length,
      failed_count: 0,
      notes:
        audienceMode === 'list'
          ? `Manual re-send to ${ids.length.toLocaleString()} hand-picked subscribers`
          : 'Manual re-send to all confirmed subscribers',
    })
    .select()
    .single();

  if (!sendRow) {
    return NextResponse.json({ error: 'Failed to create send-log row' }, { status: 500 });
  }

  const jobResult = await createEmailJob({
    kind: 'newsletter',
    subject: post.title,
    postId,
    sendId: sendRow.id,
    subscriberIds: ids,
  });

  if (!jobResult.ok) {
    return NextResponse.json({ error: jobResult.error }, { status: 500 });
  }

  await triggerWorker(jobResult.job.id);

  return NextResponse.json({
    ok: true,
    job_id: jobResult.job.id,
    send_id: sendRow.id,
    total_recipients: ids.length,
  });
}

/**
 * Resolve audience selection to a list of confirmed-subscriber UUIDs.
 *
 * mode='all': page through all confirmed subscribers (Supabase REST default
 *             1k limit means we have to .range() loop for big lists).
 * mode='list': intersect supplied IDs with confirmed-status subscribers, in
 *              URL-safe chunks (.in() serializes to URL params; large lists
 *              would otherwise hit ~8KB URL limits).
 */
async function resolveRecipientIds(
  mode: 'all' | 'list',
  suppliedIds: string[] | null
): Promise<string[]> {
  const PAGE = 1000;
  const out: string[] = [];

  if (mode === 'list' && suppliedIds) {
    const ids = suppliedIds.filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) return [];
    const URL_CHUNK = 200; // 200 * 36 chars ≈ 7.2KB, safely under URL limits
    for (let i = 0; i < ids.length; i += URL_CHUNK) {
      const chunk = ids.slice(i, i + URL_CHUNK);
      const { data, error } = await supabaseAdmin
        .from('subscribers')
        .select('id')
        .eq('status', 'confirmed')
        .in('id', chunk);
      if (error) {
        console.error('[newsletter/send] recipient lookup failed:', error.message);
        return out;
      }
      for (const row of data || []) out.push(row.id);
    }
    return out;
  }

  // mode === 'all'
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('subscribers')
      .select('id')
      .eq('status', 'confirmed')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('[newsletter/send] recipient lookup failed:', error.message);
      return out;
    }
    const batch = data || [];
    for (const row of batch) out.push(row.id);
    if (batch.length < PAGE) break;
    from += PAGE;
    if (from > 200000) break; // safety bail
  }
  return out;
}
