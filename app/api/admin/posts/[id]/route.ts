import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { readingMinutes } from '@/lib/anthropic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: {
    title: string; slug: string; excerpt: string; category: string; content: string;
    cover_image_url?: string | null; cover_image_credit?: string | null;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }

  if (!body.title?.trim() || !body.slug?.trim() || !body.content?.trim()) {
    return NextResponse.json({ error: 'Title, slug, and content are required' }, { status: 400 });
  }

  // Check slug isn't taken by a different post
  const { data: existing } = await supabaseAdmin
    .from('posts')
    .select('id')
    .eq('slug', body.slug.trim())
    .neq('id', params.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `Slug "${body.slug}" is used by another post` }, { status: 409 });
  }

  const { data: oldPost } = await supabaseAdmin.from('posts').select('slug, category').eq('id', params.id).maybeSingle();

  const { error } = await supabaseAdmin
    .from('posts')
    .update({
      title: body.title.trim(),
      slug: body.slug.trim(),
      excerpt: body.excerpt?.trim() || null,
      category: body.category?.trim() || null,
      content: body.content,
      cover_image_url: body.cover_image_url || null,
      cover_image_credit: body.cover_image_credit || null,
      read_minutes: readingMinutes(body.content),
    })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const newCategory = body.category?.trim() || null;
  revalidatePath('/');
  revalidatePath('/articles');
  if (newCategory) {
    revalidatePath(`/articles/${newCategory}/${body.slug.trim()}`);
    revalidatePath(`/articles/${newCategory}`);
  }
  if (oldPost && (oldPost.slug !== body.slug.trim() || oldPost.category !== newCategory)) {
    if (oldPost.category) {
      revalidatePath(`/articles/${oldPost.category}/${oldPost.slug}`);
      revalidatePath(`/articles/${oldPost.category}`);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  const { data: post } = await supabaseAdmin.from('posts').select('slug, category').eq('id', params.id).maybeSingle();
  const { error } = await supabaseAdmin.from('posts').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath('/');
  revalidatePath('/articles');
  if (post && post.category) {
    revalidatePath(`/articles/${post.category}/${post.slug}`);
    revalidatePath(`/articles/${post.category}`);
  }
  return NextResponse.json({ ok: true });
}
