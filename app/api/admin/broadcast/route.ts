import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createEmailJob, triggerWorker } from '@/lib/email-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Job creation is fast (resolve IDs, insert two rows, kick worker). 30s is plenty.
export const maxDuration = 30;

/**
 * POST /api/admin/broadcast
 *
 * Enqueues a broadcast email job and returns immediately. The actual sending
 * happens in the background via the chunked-worker system (see lib/email-jobs.ts
 * and app/api/internal/jobs/process/route.ts).
 *
 * No 5,000-recipient cap — the worker chunks the queue and self-triggers
 * until done. Progress is exposed via /api/admin/jobs/<id>/status, which the
 * BroadcastClient polls.
 *
 * Auth is enforced by middleware.ts on /api/admin/* routes.
 *
 * Body shape:
 *   {
 *     subject: string,
 *     body_markdown: string,
 *     mode?: 'all' | 'list'
 *     subscriber_ids?: string[]   // required when mode === 'list'
 *   }
 *
 * Response shape (success):
 *   { ok: true, job_id: string, send_id: string, total_recipients: number }
 */
export async function POST(req: NextRequest) {
  let body: {
    subject?: string;
    body_markdown?: string;
    mode?: 'all' | 'list';
    subscriber_ids?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const subject = (body.subject || '').trim();
  const bodyMarkdown = (body.body_markdown || '').trim();
  const mode = body.mode === 'list' ? 'list' : 'all';

  if (!subject) return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
  if (!bodyMarkdown) return NextResponse.json({ error: 'Body is required' }, { status: 400 });
  if (subject.length > 200) {
    return NextResponse.json({ error: 'Subject too long (max 200 chars)' }, { status: 400 });
  }

  // ─── Resolve recipient IDs ──────────────────────────────────────────
  // ALWAYS filter to status='confirmed' regardless of what IDs the client passed.
  // Page through Supabase's default 1k limit using .range().
  const PAGE = 1000;
  const allIds: string[] = [];

  if (mode === 'list') {
    const ids = Array.isArray(body.subscriber_ids)
      ? body.subscriber_ids.filter((id): id is string => typeof id === 'string')
      : [];
    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'mode=list requires a non-empty subscriber_ids array' },
        { status: 400 }
      );
    }
    // Filter the provided IDs against confirmed-status subs in URL-safe chunks.
    // .in() serializes to URL params; 200 UUIDs at 36 chars each ≈ 7.2KB, safe.
    const URL_CHUNK = 200;
    for (let i = 0; i < ids.length; i += URL_CHUNK) {
      const chunk = ids.slice(i, i + URL_CHUNK);
      const { data, error } = await supabaseAdmin
        .from('subscribers')
        .select('id')
        .eq('status', 'confirmed')
        .in('id', chunk);
      if (error) {
        return NextResponse.json(
          { error: `Recipient lookup failed: ${error.message}` },
          { status: 500 }
        );
      }
      for (const row of data || []) allIds.push(row.id);
    }
  } else {
    let from = 0;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from('subscribers')
        .select('id')
        .eq('status', 'confirmed')
        // Stable pagination requires explicit ordering. Without .order(),
        // Postgres returns rows in any order across pages — same bug as
        // the morning subscriber pagination fix. Broadcasts to >1000 subs
        // would silently skip recipients.
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        return NextResponse.json(
          { error: `Recipient lookup failed: ${error.message}` },
          { status: 500 }
        );
      }
      const batch = data || [];
      for (const row of batch) allIds.push(row.id);
      if (batch.length < PAGE) break;
      from += PAGE;
      if (from > 200000) break; // safety bail
    }
  }

  if (allIds.length === 0) {
    return NextResponse.json({
      ok: true,
      total_recipients: 0,
      message:
        mode === 'list'
          ? 'No matching confirmed subscribers found for the selected IDs.'
          : 'No confirmed subscribers — nothing sent.',
    });
  }

  // ─── Create the send-log row first (so it shows up in /admin/newsletter) ──
  const { data: sendRow, error: sendError } = await supabaseAdmin
    .from('newsletter_sends')
    .insert({
      kind: 'broadcast',
      subject,
      body_markdown: bodyMarkdown,
      status: 'sending',
      recipient_count: allIds.length,
      failed_count: 0,
      notes: mode === 'list' ? `Sent to ${allIds.length} hand-picked subscribers` : null,
    })
    .select()
    .single();

  if (sendError || !sendRow) {
    return NextResponse.json(
      { error: `Failed to create send-log row: ${sendError?.message || 'unknown'}` },
      { status: 500 }
    );
  }

  // ─── Create the email job ─────────────────────────────────────────
  const jobResult = await createEmailJob({
    kind: 'broadcast',
    subject,
    bodyMarkdown,
    sendId: sendRow.id,
    subscriberIds: allIds,
  });

  if (!jobResult.ok) {
    return NextResponse.json({ error: jobResult.error }, { status: 500 });
  }

  // ─── Kick the worker ──────────────────────────────────────────────
  // triggerWorker uses Vercel's waitUntil() so the fire-and-forget POST
  // to /api/internal/jobs/process survives past our response return.
  await triggerWorker(jobResult.job.id);

  return NextResponse.json({
    ok: true,
    job_id: jobResult.job.id,
    send_id: sendRow.id,
    total_recipients: allIds.length,
  });
}
