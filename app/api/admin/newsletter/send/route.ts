import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendNewsletterEmail } from '@/lib/resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const { data: post } = await supabaseAdmin.from('posts').select('*').eq('id', postId).maybeSingle();
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  const { data: subs } = await supabaseAdmin
    .from('subscribers')
    .select('id, email, unsubscribe_token')
    .eq('status', 'confirmed');
  const subscribers = subs || [];

  if (subscribers.length === 0) {
    return NextResponse.json({ ok: true, recipient_count: 0, failed_count: 0, message: 'No confirmed subscribers.' });
  }

  const { data: sendRow } = await supabaseAdmin
    .from('newsletter_sends')
    .insert({
      post_id: postId,
      status: 'sending',
      recipient_count: subscribers.length,
      failed_count: 0,
    })
    .select()
    .single();

  let failed = 0;
  for (const sub of subscribers) {
    const result = await sendNewsletterEmail({
      email: sub.email,
      unsubscribeToken: sub.unsubscribe_token,
      postTitle: post.title,
      postExcerpt: post.excerpt || '',
      postSlug: post.slug,
      postCoverUrl: post.cover_image_url,
      postCategory: post.category,
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
