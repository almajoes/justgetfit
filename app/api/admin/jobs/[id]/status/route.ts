import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/jobs/[id]/status
 *
 * Client polls this every ~2 seconds while a job is running to drive the
 * progress bar UI. Returns null-safe values so the client never crashes
 * on a missing field.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  const { data: job, error } = await supabaseAdmin
    .from('email_jobs')
    .select(
      'id, kind, subject, status, total_recipients, processed_count, failed_count, started_at, completed_at, last_chunk_at, error_message'
    )
    .eq('id', params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const total = job.total_recipients || 0;
  const processed = job.processed_count || 0;
  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 1000) / 10) : 0;

  // Stalled = running but no chunk progress in 10 minutes (chain probably broke)
  const STALL_MS = 10 * 60 * 1000;
  let stalled = false;
  if (job.status === 'running' && job.last_chunk_at) {
    stalled = Date.now() - new Date(job.last_chunk_at).getTime() > STALL_MS;
  }

  // Rough ETA based on average rate so far
  let estimatedRemainingMs: number | null = null;
  if (job.status === 'running' && job.started_at && processed > 0 && processed < total) {
    const elapsedMs = Date.now() - new Date(job.started_at).getTime();
    if (elapsedMs > 0) {
      const ratePerMs = processed / elapsedMs;
      if (ratePerMs > 0) {
        estimatedRemainingMs = Math.round((total - processed) / ratePerMs);
      }
    }
  }

  return NextResponse.json({
    id: job.id,
    kind: job.kind,
    subject: job.subject,
    status: job.status,
    total_recipients: total,
    processed_count: processed,
    failed_count: job.failed_count || 0,
    percent,
    started_at: job.started_at,
    completed_at: job.completed_at,
    last_chunk_at: job.last_chunk_at,
    stalled,
    estimated_remaining_ms: estimatedRemainingMs,
    error_message: job.error_message,
  });
}
