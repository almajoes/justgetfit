import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { readingMinutes } from '@/lib/anthropic';
import { sendNewsletterEmail } from '@/lib/resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: {
    action: 'save' | 'publish' | 'reject';
    title: string;
    slug: string;
    excerpt: string;
    category: string;
    content: string;
    cover_image_url?: string | null;
    cover_image_credit?: string | null;
    send_newsletter?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    action, title, slug, excerpt, category, content,
    cover_image_url, cover_image_credit, send_newsletter,
  } = body;

  if (!action || !['save', 'publish', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  if (action !== 'reject' && (!title?.trim() || !slug?.trim() || !content?.trim())) {
    return NextResponse.json({ error: 'Title, slug, and content are required.' }, { status: 400 });
  }

  try {
    if (action === 'reject') {
      await supabaseAdmin.from('drafts').update({ status: 'rejected' }).eq('id', params.id);
      return NextResponse.json({ ok: true });
    }

    await supabaseAdmin
      .from('drafts')
      .update({
        title: title.trim(),
        slug: slug.trim(),
        excerpt: excerpt?.trim() || null,
        category: category?.trim() || null,
        content,
        cover_image_url: cover_image_url || null,
        cover_image_credit: cover_image_credit || null,
      })
      .eq('id', params.id);

    if (action === 'save') return NextResponse.json({ ok: true });

    // Publish
    const { data: existing } = await supabaseAdmin
      .from('posts')
      .select('id')
      .eq('slug', slug.trim())
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: `Slug "${slug}" is already used. Change the slug and try again.` },
        { status: 409 }
      );
    }

    const { data: post, error: insertError } = await supabaseAdmin
      .from('posts')
      .insert({
        title: title.trim(),
        slug: slug.trim(),
        excerpt: excerpt?.trim() || null,
        category: category?.trim() || null,
        content,
        cover_image_url: cover_image_url || null,
        cover_image_credit: cover_image_credit || null,
        draft_id: params.id,
        read_minutes: readingMinutes(content),
        published_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insertError) throw insertError;

    await supabaseAdmin.from('drafts').update({ status: 'approved' }).eq('id', params.id);

    revalidatePath('/');
    revalidatePath('/articles');
    if (post.category) {
      revalidatePath(`/articles/${post.category}/${post.slug}`);
      revalidatePath(`/articles/${post.category}`);
    }

    let newsletterStats: { recipient_count: number; failed_count: number } | null = null;

    if (send_newsletter) {
      newsletterStats = await sendBlastForPost(post.id);
    }

    return NextResponse.json({
      ok: true,
      postSlug: post.slug,
      postCategory: post.category,
      newsletter: newsletterStats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error';
    console.error(`Draft action ${action} failed:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Send the article to all confirmed subscribers, log each batch.
 */
async function sendBlastForPost(postId: string) {
  const { data: post } = await supabaseAdmin
    .from('posts')
    .select('*')
    .eq('id', postId)
    .single();
  if (!post) return { recipient_count: 0, failed_count: 0 };

  const { data: subs } = await supabaseAdmin
    .from('subscribers')
    .select('id, email, unsubscribe_token')
    .eq('status', 'confirmed');
  const subscribers = subs || [];

  // Create a sending record
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
    });
    if (!result.ok) failed++;
    else await supabaseAdmin.from('subscribers').update({ last_sent_at: new Date().toISOString() }).eq('id', sub.id);
  }

  if (sendRow) {
    await supabaseAdmin
      .from('newsletter_sends')
      .update({
        status: failed === subscribers.length && subscribers.length > 0 ? 'failed' : 'completed',
        failed_count: failed,
      })
      .eq('id', sendRow.id);
  }

  return { recipient_count: subscribers.length, failed_count: failed };
}
