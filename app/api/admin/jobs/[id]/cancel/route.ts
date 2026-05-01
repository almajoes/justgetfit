import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { triggerWorker, finalizeJob } from '@/lib/email-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/jobs/[id]/cancel
 *   body: { action: 'cancel' | 'resume' }
 *
 * cancel: flips status to 'canceled'. The currently-in-flight chunk (if any)
 *         finishes its loop, but the worker won't pop another one because
 *         popJobChunk() short-circuits on terminal status.
 *
 * resume: re-fires the worker for a job that's running but stalled.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let action: string;
  try {
    const body = await req.json();
    action = String(body.action || '');
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: job } = await supabaseAdmin
    .from('email_jobs')
    .select('id, status, pending_ids, send_id')
    .eq('id', params.id)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if (action === 'cancel') {
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'canceled') {
      return NextResponse.json({ error: `Job is already ${job.status}` }, { status: 400 });
    }

    await supabaseAdmin
      .from('email_jobs')
      .update({
        status: 'canceled',
        completed_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    // Reflect in newsletter_sends so the existing log doesn't show 'sending' forever.
    if (job.send_id) {
      await supabaseAdmin
        .from('newsletter_sends')
        .update({
          status: 'failed', // newsletter_sends.status doesn't have 'canceled'; closest is 'failed'
          notes: 'Canceled by admin during send',
        })
        .eq('id', job.send_id);
    }

    return NextResponse.json({ ok: true, status: 'canceled' });
  }

  if (action === 'resume') {
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'canceled') {
      return NextResponse.json({ error: `Job is ${job.status} — cannot resume` }, { status: 400 });
    }

    if (!job.pending_ids || job.pending_ids.length === 0) {
      // No work left — finalize directly.
      await finalizeJob(params.id);
      return NextResponse.json({ ok: true, status: 'completed' });
    }

    await triggerWorker(params.id);
    return NextResponse.json({ ok: true, status: 'resumed' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
