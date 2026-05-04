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
 * Internal worker route at /api/internal/jobs/process.
 *
 * NOT under /api/admin/* on purpose: middleware enforces basic-auth there,
 * and the worker authenticates with a shared secret, not basic-auth.
 *
 * ─── Architecture (May 4 2026 redesign) ─────────────────────────────
 *
 * The worker now processes MULTIPLE chunks within a single function
 * invocation, looping until either the job is done OR we hit the time
 * budget. Only at the time-budget boundary do we chain to a fresh worker
 * via HTTP.
 *
 * Why: the previous design chained to a fresh worker after EACH chunk
 * (~10 chains for a 1000-subscriber send), and any chain failure (lost
 * waitUntil(), Vercel cold start, network blip) silently broke the chain
 * and left subscribers unsent. May 4 2026: a 750-subscriber send dropped
 * 565 subscribers when the chain broke after chunk 5.
 *
 * The new design has just 1-2 chain points for typical sends (under 4000
 * recipients) instead of 10+, eliminating the vast majority of failure
 * surface. The watchdog cron at /api/cron/watchdog-jobs catches the rare
 * remaining cases as a safety net.
 *
 * ─── Per-invocation workflow ─────────────────────────────────────────
 *   1. Validate JOB_WORKER_SECRET header
 *   2. Loop:
 *      a. Check if we've used too much time → chain and exit
 *      b. Pop next chunk from job.pending_ids
 *      c. If empty → finalizeJob and exit
 *      d. Send each email via Resend, batch-update last_sent_at, record results
 *      e. Continue loop
 *
 * ─── Sizing ──────────────────────────────────────────────────────────
 * Chunk size: 100. Resend allows ~14 sends/sec with batched API. ~7-9s per chunk.
 * Time budget: 80s. Leaves 10s of headroom on the 90s maxDuration for
 *   the final finalizeJob/triggerWorker DB writes.
 * 80s ÷ 9s/chunk ≈ 8 chunks per invocation = 800 subscribers per invocation.
 * Most sends finish in one invocation; large sends chain just once or twice.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const CHUNK_SIZE = 100;
const TIME_BUDGET_MS = 80 * 1000;

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

  // ─── Load job metadata ONCE upfront (not per-chunk) ────────────────
  // Same metadata applies across every chunk we process in this invocation,
  // so we fetch once and reuse rather than re-fetching every iteration.
  const { data: job, error: jobError } = await supabaseAdmin
    .from('email_jobs')
    .select('kind, subject, body_markdown, post_id, send_id')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    console.error(`[worker] job ${jobId} not found`);
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

  // ─── Multi-chunk loop ──────────────────────────────────────────────
  // Process chunks back-to-back within this single function invocation.
  // Exit when: (a) no more pending IDs, (b) time budget exhausted.
  const startedAt = Date.now();
  const summary = {
    chunksProcessed: 0,
    totalSucceeded: 0,
    totalFailed: 0,
    totalSkipped: 0,
    chainedToNext: false,
  };

  while (true) {
    // Time-budget check BEFORE popping next chunk. If we're close to the
    // limit, chain to a fresh worker and exit so we don't get killed
    // mid-chunk (which would leave the popped IDs in limbo — no longer
    // pending, but never sent).
    const elapsed = Date.now() - startedAt;
    if (elapsed >= TIME_BUDGET_MS) {
      // Hand off to a fresh worker invocation. The pending_ids in the DB
      // already reflect what's left to do — the next worker just resumes.
      console.log(`[worker] time budget hit after ${summary.chunksProcessed} chunks; chaining`);
      await triggerWorker(jobId);
      summary.chainedToNext = true;
      break;
    }

    // ─── Pop next chunk ──────────────────────────────────────────────
    const popResult = await popJobChunk(jobId, CHUNK_SIZE);
    if (!popResult.ok) {
      console.error(`[worker] pop failed for job ${jobId}: ${popResult.error}`);
      // Don't chain on errors — let the watchdog cron decide what to do.
      // The job remains in 'running' status; watchdog will retry in ~2 min
      // and either resume or mark failed if it stays stuck.
      return NextResponse.json({ error: popResult.error }, { status: 500 });
    }

    // No work to do — finalize and exit
    if (popResult.ids.length === 0) {
      if (popResult.status !== 'canceled' && popResult.status !== 'failed') {
        await finalizeJob(jobId);
      }
      return NextResponse.json({
        ok: true,
        ...summary,
        remaining: 0,
        done: true,
      });
    }

    // ─── Look up subscribers for this chunk ────────────────────────
    const { data: subs, error: subsError } = await supabaseAdmin
      .from('subscribers')
      .select('id, email, unsubscribe_token, status')
      .in('id', popResult.ids);

    if (subsError) {
      console.error(`[worker] subscriber lookup failed: ${subsError.message}`);
      // Record the chunk as fully skipped and keep going — next chunk
      // might succeed. Don't bail out on transient lookup failures.
      await recordChunkResults(jobId, 0, 0, popResult.ids.length);
      summary.totalSkipped += popResult.ids.length;
      summary.chunksProcessed += 1;
      continue;
    }

    const eligibleSubs = (subs || []).filter((s) => s.status === 'confirmed');
    const skipped = popResult.ids.length - eligibleSubs.length;

    // ─── Send each email ───────────────────────────────────────────
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

    // ─── Batch update last_sent_at ─────────────────────────────────
    if (successfulSubIds.length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('subscribers')
        .update({ last_sent_at: new Date().toISOString() })
        .in('id', successfulSubIds);
      if (updateError) {
        console.warn(`[worker] last_sent_at batch update failed: ${updateError.message}`);
      }
    }

    // ─── Record chunk results ──────────────────────────────────────
    await recordChunkResults(jobId, succeeded, failed, skipped);

    summary.chunksProcessed += 1;
    summary.totalSucceeded += succeeded;
    summary.totalFailed += failed;
    summary.totalSkipped += skipped;

    // If this was the last chunk, finalize and exit (avoids one extra
    // pop + empty-result loop iteration).
    if (popResult.remaining === 0) {
      await finalizeJob(jobId);
      return NextResponse.json({
        ok: true,
        ...summary,
        remaining: 0,
        done: true,
      });
    }

    // Otherwise loop back and process the next chunk.
  }

  // We hit the time budget and chained to next worker. Return a non-done
  // response so the caller knows more chunks are still pending.
  return NextResponse.json({
    ok: true,
    ...summary,
    done: false,
  });
}
