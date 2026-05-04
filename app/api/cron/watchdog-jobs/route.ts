import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { triggerWorker, finalizeJob } from '@/lib/email-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Watchdog for stuck email jobs.
 *
 * The worker self-chains via triggerWorker() at the end of each chunk. If the
 * chain breaks (network blip, Vercel function cold-start timeout, lost
 * waitUntil()), a job sits in status='running' with last_chunk_at frozen and
 * processed_count < total_recipients. Without intervention, the missing
 * subscribers never receive the email and the UI shows "stuck" indefinitely.
 *
 * This watchdog runs every minute. For each job stuck >2 minutes:
 *   - If pending_ids is non-empty, kick the chain (triggerWorker) to resume.
 *   - If pending_ids is empty (already done, just never finalized), call
 *     finalizeJob to flip the status to completed.
 *
 * Stuck >15 minutes after multiple resume attempts: mark failed so it doesn't
 * keep getting kicked forever.
 *
 * Auth: standard cron secret. Also callable manually via:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://justgetfit.org/api/cron/watchdog-jobs
 */

const STALE_AFTER_MS = 2 * 60 * 1000;       // 2 minutes — kick stalled jobs
const GIVE_UP_AFTER_MS = 15 * 60 * 1000;    // 15 minutes — mark failed

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const now = Date.now();
  const staleCutoff = new Date(now - STALE_AFTER_MS).toISOString();
  // Note: GIVE_UP_AFTER_MS comparison is done in the per-job loop below using
  // ageMs computed from last_chunk_at, so we don't need a separate cutoff here.

  // Find jobs that are running but haven't seen a chunk in 2+ min
  const { data: stuckJobs, error } = await supabaseAdmin
    .from('email_jobs')
    .select('id, status, processed_count, total_recipients, last_chunk_at, started_at, pending_ids, send_id')
    .eq('status', 'running')
    .lt('last_chunk_at', staleCutoff);

  if (error) {
    console.error('[watchdog] query failed:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const result: { id: string; action: string; reason: string }[] = [];

  for (const job of stuckJobs || []) {
    const lastChunkAt = job.last_chunk_at ? new Date(job.last_chunk_at).getTime() : 0;
    const ageMs = now - lastChunkAt;
    const pendingCount = (job.pending_ids || []).length;

    // Give up on jobs stuck >15 min; mark failed and finalize.
    if (ageMs > GIVE_UP_AFTER_MS) {
      await supabaseAdmin
        .from('email_jobs')
        .update({
          status: 'failed',
          error_message: `Watchdog: job stuck >15min with ${pendingCount} pending IDs. Worker chain broken; giving up.`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      // Mirror to newsletter_sends so UI flips out of 'sending'.
      if (job.send_id) {
        await supabaseAdmin
          .from('newsletter_sends')
          .update({ status: 'failed' })
          .eq('id', job.send_id);
      }

      result.push({ id: job.id, action: 'gave_up', reason: `stuck ${Math.round(ageMs / 60000)}min, ${pendingCount} pending` });
      continue;
    }

    // No pending IDs left → just finalize
    if (pendingCount === 0) {
      await finalizeJob(job.id);
      result.push({ id: job.id, action: 'finalized', reason: 'no pending IDs, just needed to flip status' });
      continue;
    }

    // Has pending IDs and age 2-15 min → resume the chain
    await triggerWorker(job.id);
    result.push({ id: job.id, action: 'resumed', reason: `${pendingCount} pending, kicking worker` });
  }

  return NextResponse.json({
    ok: true,
    found: stuckJobs?.length ?? 0,
    actions: result,
  });
}
