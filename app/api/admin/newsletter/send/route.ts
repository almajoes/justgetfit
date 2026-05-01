import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createEmailJob, triggerWorker } from '@/lib/email-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/admin/newsletter/send
 *   body: { postId: string }
 *
 * Manually re-blast an already-published post. Used as an admin escape
 * hatch — does NOT track who already received the post; calling this for
 * a post that already had a successful send will email everyone again.
 *
 * Like the publish path, this enqueues a job and returns immediately with
 * a job_id the client can poll.
 */
export async function POST(req: NextRequest) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let postId: string;
  try {
    const body = await req.json();
    postId = String(body.postId || '');
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

  const { data: post } = await supabaseAdmin
    .from('posts')
    .select('id, title')
    .eq('id', postId)
    .maybeSingle();
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  // Page through confirmed subscribers
  const PAGE = 1000;
  const ids: string[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabaseAdmin
      .from('subscribers')
      .select('id')
      .eq('status', 'confirmed')
      .range(from, from + PAGE - 1);
    const batch = data || [];
    for (const row of batch) ids.push(row.id);
    if (batch.length < PAGE) break;
    from += PAGE;
    if (from > 200000) break;
  }

  if (ids.length === 0) {
    return NextResponse.json({
      ok: true,
      total_recipients: 0,
      message: 'No confirmed subscribers.',
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
      notes: 'Manual re-send from admin',
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
