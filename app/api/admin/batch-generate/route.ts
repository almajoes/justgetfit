import { NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateDraft } from '@/lib/anthropic';
import { searchUnsplash } from '@/lib/unsplash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const { data: topics } = await supabaseAdmin
      .from('topics')
      .select('*')
      .is('used_at', null)
      .limit(50);

    if (!topics || topics.length === 0) {
      return NextResponse.json({ error: 'No unused topics' }, { status: 400 });
    }

    const topic = topics[Math.floor(Math.random() * topics.length)];
    const generated = await generateDraft({
      title: topic.title,
      category: topic.category,
      angle: topic.angle,
    });
    const photo = await searchUnsplash(generated.imageKeywords);

    let slug = generated.slug;
    let suffix = 1;
    while (true) {
      const [{ data: postHit }, { data: draftHit }] = await Promise.all([
        supabaseAdmin.from('posts').select('id').eq('slug', slug).maybeSingle(),
        supabaseAdmin.from('drafts').select('id').eq('slug', slug).maybeSingle(),
      ]);
      if (!postHit && !draftHit) break;
      suffix += 1;
      slug = `${generated.slug}-${suffix}`;
      if (suffix > 50) throw new Error('Slug collision');
    }

    const { data: draft, error } = await supabaseAdmin
      .from('drafts')
      .insert({
        title: generated.title,
        slug,
        excerpt: generated.excerpt,
        content: generated.content,
        category: generated.category,
        cover_image_url: photo?.url ?? null,
        cover_image_credit: photo?.credit ?? null,
        topic_id: topic.id,
        status: 'pending',
        generation_model: generated.model,
        generation_notes: `Batch-generated ${new Date().toISOString()}`,
      })
      .select()
      .single();
    if (error) throw error;

    await supabaseAdmin.from('topics').update({ used_at: new Date().toISOString() }).eq('id', topic.id);

    return NextResponse.json({ ok: true, draftId: draft.id, title: draft.title });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Generation failed';
    console.error('Batch generate failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
