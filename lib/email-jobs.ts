import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * lib/email-jobs.ts
 *
 * Helpers for the chunked-send job system. Jobs are processed by a single
 * worker chain — the API handler that creates a job kicks the worker once,
 * and each worker run kicks the next. So at any moment there is at most ONE
 * worker running per job, which simplifies the queue logic considerably:
 * no locks, no optimistic concurrency, just plain reads and writes.
 *
 * Recipient list is snapshotted at job creation in `pending_ids`. We do not
 * re-query subscribers mid-run. A subscriber unsubscribing during a long send
 * may still receive an in-flight email — same as the old synchronous code,
 * intentional.
 */

export type EmailJobKind = 'newsletter' | 'broadcast';

export type EmailJob = {
  id: string;
  kind: EmailJobKind;
  subject: string;
  body_markdown: string | null;
  post_id: string | null;
  send_id: string | null;
  pending_ids: string[];
  total_recipients: number;
  processed_count: number;
  failed_count: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  last_chunk_at: string | null;
};

/**
 * Insert a new job row with a snapshot of subscriber IDs and link it to the
 * already-created newsletter_sends row.
 */
export async function createEmailJob(input: {
  kind: EmailJobKind;
  subject: string;
  bodyMarkdown?: string | null;
  postId?: string | null;
  sendId?: string | null;
  subscriberIds: string[];
}): Promise<{ ok: true; job: EmailJob } | { ok: false; error: string }> {
  // Defensive dedupe: Postgres uuid[] doesn't auto-dedupe.
  const uniqueIds = Array.from(new Set(input.subscriberIds));

  const { data, error } = await supabaseAdmin
    .from('email_jobs')
    .insert({
      kind: input.kind,
      subject: input.subject,
      body_markdown: input.bodyMarkdown ?? null,
      post_id: input.postId ?? null,
      send_id: input.sendId ?? null,
      pending_ids: uniqueIds,
      total_recipients: uniqueIds.length,
      processed_count: 0,
      failed_count: 0,
      status: 'queued',
    })
    .select('*')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || 'Failed to create email job' };
  }
  return { ok: true, job: data as EmailJob };
}

/**
 * Pop the next chunk from a job's pending_ids and mark the job as running.
 *
 * Returns:
 *   - ids: subscriber UUIDs to process now
 *   - remaining: how many IDs remain in pending_ids after this pop
 *   - status: current job status (so the worker can detect cancellation)
 *
 * Implementation: read job → slice → write back. Safe because only one
 * worker runs per job at a time (each worker fires the next).
 */
export async function popJobChunk(
  jobId: string,
  chunkSize: number
): Promise<
  | { ok: true; ids: string[]; remaining: number; status: EmailJob['status'] }
  | { ok: false; error: string }
> {
  const { data: job, error: readError } = await supabaseAdmin
    .from('email_jobs')
    .select('pending_ids, status, started_at')
    .eq('id', jobId)
    .single();

  if (readError || !job) {
    return { ok: false, error: readError?.message || 'Job not found' };
  }

  // If terminal, return nothing — the worker will short-circuit.
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'canceled') {
    return { ok: true, ids: [], remaining: 0, status: job.status };
  }

  const pending: string[] = job.pending_ids || [];
  const popped = pending.slice(0, chunkSize);
  const remaining = pending.slice(chunkSize);

  const updates: {
    pending_ids: string[];
    status: EmailJob['status'];
    last_chunk_at: string;
    started_at?: string;
  } = {
    pending_ids: remaining,
    status: 'running',
    last_chunk_at: new Date().toISOString(),
  };
  if (!job.started_at) {
    updates.started_at = new Date().toISOString();
  }

  const { error: writeError } = await supabaseAdmin
    .from('email_jobs')
    .update(updates)
    .eq('id', jobId);

  if (writeError) {
    return { ok: false, error: writeError.message };
  }

  return { ok: true, ids: popped, remaining: remaining.length, status: 'running' };
}

/**
 * Atomically increment processed_count and failed_count after a chunk.
 * Reads current values then writes — safe because only one worker runs at a time.
 */
export async function recordChunkResults(
  jobId: string,
  succeeded: number,
  failed: number,
  skipped: number
): Promise<void> {
  const { data: current } = await supabaseAdmin
    .from('email_jobs')
    .select('processed_count, failed_count')
    .eq('id', jobId)
    .single();

  if (!current) return;

  await supabaseAdmin
    .from('email_jobs')
    .update({
      processed_count: (current.processed_count || 0) + succeeded + failed + skipped,
      failed_count: (current.failed_count || 0) + failed,
    })
    .eq('id', jobId);
}

/**
 * Mark job complete and mirror final tallies to the linked newsletter_sends row
 * (so the existing /admin/newsletter log shows the right numbers without needing
 * to query email_jobs).
 */
export async function finalizeJob(jobId: string): Promise<void> {
  const { data: job } = await supabaseAdmin
    .from('email_jobs')
    .select('processed_count, failed_count, send_id, total_recipients')
    .eq('id', jobId)
    .single();

  if (!job) return;

  // 'failed' only if every email actually attempted failed (skipped doesn't count
  // as "tried and failed"). If processed - failed - skipped > 0, mark completed.
  const successfulSends = (job.processed_count || 0) - (job.failed_count || 0);
  const finalStatus =
    job.processed_count > 0 && successfulSends === 0 && job.failed_count > 0
      ? 'failed'
      : 'completed';

  await supabaseAdmin
    .from('email_jobs')
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (job.send_id) {
    await supabaseAdmin
      .from('newsletter_sends')
      .update({
        status: finalStatus,
        recipient_count: job.total_recipients,
        failed_count: job.failed_count,
      })
      .eq('id', job.send_id);
  }
}

/**
 * Fire-and-forget kick of the internal worker route.
 *
 * Uses Vercel's `waitUntil()` which keeps the parent function alive long
 * enough for the fetch to land at the worker route, but does NOT block the
 * parent function's response. This is the documented Vercel pattern for
 * "do something async after returning a response."
 *
 * Without `waitUntil`, an unawaited fetch() would be killed when the parent
 * serverless function returns. Awaiting the full fetch().json() would block
 * the response on the worker's chunk completion (~7s), defeating the point.
 * `waitUntil` is the only correct middle ground on Vercel.
 *
 * If the worker can't be reached (env not set, network blip), the job sits
 * in queued/running until the user clicks "Resume" in the admin UI.
 */
export async function triggerWorker(jobId: string): Promise<void> {
  const baseUrl = getInternalBaseUrl();
  const secret = process.env.JOB_WORKER_SECRET;

  if (!secret) {
    console.error('[email-jobs] JOB_WORKER_SECRET not set; cannot trigger worker');
    return;
  }

  const url = `${baseUrl}/api/internal/jobs/process`;

  // Build the fetch promise. We attach a .catch so unhandled rejections don't
  // crash the runtime if the worker is unreachable. We do NOT await it here —
  // waitUntil takes care of keeping the function alive long enough.
  const kickPromise = fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Secret': secret,
    },
    body: JSON.stringify({ job_id: jobId }),
    cache: 'no-store',
  })
    .then(async (res) => {
      if (!res.ok) {
        console.error(`[email-jobs] worker kick returned ${res.status}`);
      }
      // Drain the body so the connection closes cleanly, but we don't
      // actually wait for the worker to finish processing — the worker
      // returns its 200 quickly, before the long-running send work.
      // (Actually, the worker DOES await its own work. That's fine —
      // waitUntil's lifetime is bounded by the parent's maxDuration; if
      // the worker is still going, it has its own function lifetime.)
      try {
        await res.text();
      } catch {
        /* ignore */
      }
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[email-jobs] triggerWorker fetch failed: ${msg}`);
    });

  // waitUntil extends the function's lifetime past the response so the kick
  // actually lands. Lazy-loaded to avoid hard-failing if the package is
  // missing in non-Vercel environments (e.g. local dev without it).
  try {
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(kickPromise);
  } catch {
    // Fallback for non-Vercel runtimes: just await the kick. This blocks
    // the parent response a bit but is correct in serverful environments.
    await kickPromise;
  }
}

function getInternalBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
