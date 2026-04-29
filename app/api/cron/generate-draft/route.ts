import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateDraft } from '@/lib/anthropic';
import { searchUnsplash } from '@/lib/unsplash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const { data: topics } = await supabaseAdmin
      .from('topics')
      .select('*')
      .is('used_at', null)
      .limit(50);

    if (!topics || topics.length === 0) {
      return NextResponse.json({
        ok: false,
        message: 'No unused topics in queue. Add more topics in /admin/topics.',
      });
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
      if (suffix > 50) throw new Error('Could not generate unique slug');
    }

    const { data: draft, error: insertError } = await supabaseAdmin
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
        generation_notes: `Auto-generated from topic "${topic.title}" on ${new Date().toISOString()}`,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    await supabaseAdmin
      .from('topics')
      .update({ used_at: new Date().toISOString() })
      .eq('id', topic.id);

    return NextResponse.json({
      ok: true,
      draftId: draft.id,
      title: draft.title,
      coverImage: photo?.url ?? null,
      reviewUrl: `/admin/drafts/${draft.id}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Cron generate-draft failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
