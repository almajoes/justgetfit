import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendNewsletterEmail, sendBroadcastEmail } from '@/lib/resend';
import {
  popJobChunk,
  recordChunkResults,
  finalizeJob,
  triggerWorker,
} from '@/lib/email-jobs';

/**
 * Internal worker route at /api/_internal/jobs/process.
 *
 * NOT under /api/admin/* on purpose: middleware enforces basic-auth there,
 * and the worker authenticates with a shared secret, not basic-auth.
 *
 * Per-request workflow:
 *   1. Validate JOB_WORKER_SECRET header
 *   2. Pop next chunk of subscriber IDs from job.pending_ids
 *   3. Send each email via Resend
 *   4. Batch-update last_sent_at for successful recipients (ONE query)
 *   5. Record chunk results in email_jobs (counts)
 *   6. If pending_ids is empty → finalizeJob and return
 *   7. Otherwise → triggerWorker(jobId) for the next chunk and return
 *
 * Chunk size: 100. At ~14 emails/sec via Resend, 100 emails = ~7s of sends.
 * Plus ~1s for DB ops = ~8s per chunk total. Well under 60s timeout.
 * 100 also keeps last_sent_at batch updates safe (small WHERE IN clause).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CHUNK_SIZE = 100;

export async function POST(req: NextRequest) {
  // ─── Auth ──────────────────────────────────────────────────────────
  const expectedSecret = process.env.JOB_WORKER_SECRET;
  if (!expectedSecret) {
    console.error('[worker] JOB_WORKER_SECRET not configured');
    return NextResponse.json({ error: 'Worker not configured' }, { status: 500 });
  }
  if (req.headers.get('x-worker-secret') !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ─── Parse ─────────────────────────────────────────────────────────
  let jobId: string;
  try {
    const body = await req.json();
    jobId = String(body.job_id || '');
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!jobId) {
    return NextResponse.json({ error: 'job_id required' }, { status: 400 });
  }

  // ─── Pop next chunk ────────────────────────────────────────────────
  const popResult = await popJobChunk(jobId, CHUNK_SIZE);
  if (!popResult.ok) {
    console.error(`[worker] pop failed for job ${jobId}: ${popResult.error}`);
    return NextResponse.json({ error: popResult.error }, { status: 500 });
  }

  // No work to do (job already finished or was canceled)
  if (popResult.ids.length === 0) {
    if (popResult.status !== 'canceled' && popResult.status !== 'failed') {
      await finalizeJob(jobId);
    }
    return NextResponse.json({ ok: true, processed: 0, remaining: 0, done: true });
  }

  // ─── Load job metadata ─────────────────────────────────────────────
  const { data: job, error: jobError } = await supabaseAdmin
    .from('email_jobs')
    .select('kind, subject, body_markdown, post_id, send_id')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    console.error(`[worker] job ${jobId} disappeared mid-process`);
    return NextResponse.json({ error: 'Job not found' }, { status: 500 });
  }

  // For newsletter jobs we need the post details to render the email.
  let post:
    | {
        title: string;
        excerpt: string | null;
        slug: string;
        cover_image_url: string | null;
        category: string | null;
      }
    | null = null;

  if (job.kind === 'newsletter' && job.post_id) {
    const { data } = await supabaseAdmin
      .from('posts')
      .select('title, excerpt, slug, cover_image_url, category')
      .eq('id', job.post_id)
      .single();
    post = data;

    if (!post) {
      // Post was deleted between job creation and processing — fail the job.
      console.error(`[worker] post ${job.post_id} not found`);
      await supabaseAdmin
        .from('email_jobs')
        .update({
          status: 'failed',
          error_message: 'Linked post no longer exists',
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
      return NextResponse.json({ error: 'Linked post not found' }, { status: 500 });
    }
  }

  // ─── Look up subscribers for this chunk ────────────────────────────
  // Always re-filter to status='confirmed' (defense in depth; subscribers may
  // have unsubscribed between job creation and now).
  const { data: subs, error: subsError } = await supabaseAdmin
    .from('subscribers')
    .select('id, email, unsubscribe_token, status')
    .in('id', popResult.ids);

  if (subsError) {
    console.error(`[worker] subscriber lookup failed: ${subsError.message}`);
    // Don't crash the chain — we couldn't look up these subscribers, so we don't
    // know if they would have succeeded or failed. Record as skipped (no email
    // attempt was made) and keep the chain going.
    await recordChunkResults(jobId, 0, 0, popResult.ids.length);
    if (popResult.remaining > 0) {
      await triggerWorker(jobId);
    } else {
      await finalizeJob(jobId);
    }
    return NextResponse.json({ error: subsError.message }, { status: 500 });
  }

  const eligibleSubs = (subs || []).filter((s) => s.status === 'confirmed');
  const skipped = popResult.ids.length - eligibleSubs.length;

  // ─── Send each email ───────────────────────────────────────────────
  let succeeded = 0;
  let failed = 0;
  const successfulSubIds: string[] = [];

  for (const sub of eligibleSubs) {
    let result: { ok: boolean; error?: string };

    if (job.kind === 'newsletter' && post) {
      result = await sendNewsletterEmail({
        email: sub.email,
        unsubscribeToken: sub.unsubscribe_token,
        postTitle: post.title,
        postExcerpt: post.excerpt || '',
        postSlug: post.slug,
        postCoverUrl: post.cover_image_url,
        postCategory: post.category,
        sendId: job.send_id || undefined,
      });
    } else if (job.kind === 'broadcast') {
      result = await sendBroadcastEmail({
        email: sub.email,
        unsubscribeToken: sub.unsubscribe_token,
        subject: job.subject,
        bodyMarkdown: job.body_markdown || '',
        sendId: job.send_id || undefined,
      });
    } else {
      result = { ok: false, error: 'Unknown job kind' };
    }

    if (result.ok) {
      succeeded++;
      successfulSubIds.push(sub.id);
    } else {
      failed++;
      console.warn(`[worker] send failed to ${sub.email}: ${result.error}`);
    }
  }

  // ─── Batch update last_sent_at for everyone we successfully emailed ──
  // Single query, not one-per-subscriber. Critical for staying inside the
  // 60s timeout.
  if (successfulSubIds.length > 0) {
    const { error: updateError } = await supabaseAdmin
      .from('subscribers')
      .update({ last_sent_at: new Date().toISOString() })
      .in('id', successfulSubIds);
    if (updateError) {
      console.warn(`[worker] last_sent_at batch update failed: ${updateError.message}`);
      // Non-fatal — emails went out, this is just bookkeeping.
    }
  }

  // ─── Record results in email_jobs ──────────────────────────────────
  await recordChunkResults(jobId, succeeded, failed, skipped);

  // ─── Chain or finalize ─────────────────────────────────────────────
  if (popResult.remaining > 0) {
    await triggerWorker(jobId);
    return NextResponse.json({
      ok: true,
      processed: popResult.ids.length,
      succeeded,
      failed,
      skipped,
      remaining: popResult.remaining,
      done: false,
    });
  }

  await finalizeJob(jobId);
  return NextResponse.json({
    ok: true,
    processed: popResult.ids.length,
    succeeded,
    failed,
    skipped,
    remaining: 0,
    done: true,
  });
}
