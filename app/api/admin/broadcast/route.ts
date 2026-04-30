import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendBroadcastEmail } from '@/lib/resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/broadcast
 *
 * Sends an arbitrary email (subject + Markdown body) to a chosen set of subscribers.
 * Logs the entire send to newsletter_sends with kind='broadcast'.
 *
 * Auth is enforced by middleware.ts on /api/admin/* routes.
 *
 * Body shape:
 *   {
 *     subject: string,
 *     body_markdown: string,
 *     mode?: 'all' | 'list'           // default 'all' for backward compat
 *     subscriber_ids?: string[]       // required when mode === 'list'
 *   }
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
  if (subject.length > 200) return NextResponse.json({ error: 'Subject too long (max 200 chars)' }, { status: 400 });

  // Build the recipient query based on mode.
  // ALWAYS filter to status='confirmed' regardless of what IDs the client passed —
  // never send to pending, unsubscribed, or bounced subscribers even if the admin
  // accidentally selects them.
  let query = supabaseAdmin
    .from('subscribers')
    .select('id, email, unsubscribe_token')
    .eq('status', 'confirmed');

  if (mode === 'list') {
    const ids = Array.isArray(body.subscriber_ids) ? body.subscriber_ids.filter((id): id is string => typeof id === 'string') : [];
    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'mode=list requires a non-empty subscriber_ids array' },
        { status: 400 }
      );
    }
    if (ids.length > 5000) {
      return NextResponse.json(
        { error: 'Cannot target more than 5000 subscribers per broadcast' },
        { status: 400 }
      );
    }
    query = query.in('id', ids);
  }

  const { data: subs, error: queryError } = await query;
  if (queryError) {
    return NextResponse.json({ error: `Recipient lookup failed: ${queryError.message}` }, { status: 500 });
  }
  const subscribers = subs || [];

  if (subscribers.length === 0) {
    return NextResponse.json({
      ok: true,
      recipient_count: 0,
      failed_count: 0,
      message:
        mode === 'list'
          ? 'No matching confirmed subscribers found for the selected IDs.'
          : 'No confirmed subscribers — nothing sent.',
    });
  }

  // Create the send log row up front
  const { data: sendRow } = await supabaseAdmin
    .from('newsletter_sends')
    .insert({
      kind: 'broadcast',
      subject,
      body_markdown: bodyMarkdown,
      status: 'sending',
      recipient_count: subscribers.length,
      failed_count: 0,
      notes: mode === 'list' ? `Sent to ${subscribers.length} hand-picked subscribers` : null,
    })
    .select()
    .single();

  let failed = 0;
  for (const sub of subscribers) {
    const result = await sendBroadcastEmail({
      email: sub.email,
      unsubscribeToken: sub.unsubscribe_token,
      subject,
      bodyMarkdown,
      sendId: sendRow?.id,
    });
    if (!result.ok) failed++;
    else
      await supabaseAdmin
        .from('subscribers')
        .update({ last_sent_at: new Date().toISOString() })
        .eq('id', sub.id);
  }

  if (sendRow) {
    await supabaseAdmin
      .from('newsletter_sends')
      .update({
        status: failed === subscribers.length ? 'failed' : 'completed',
        failed_count: failed,
      })
      .eq('id', sendRow.id);
  }

  return NextResponse.json({
    ok: true,
    recipient_count: subscribers.length,
    failed_count: failed,
  });
}
