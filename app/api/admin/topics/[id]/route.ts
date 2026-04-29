import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: { action: 'update' | 'mark_unused'; title?: string; category?: string; angle?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }

  if (body.action === 'mark_unused') {
    const { error } = await supabaseAdmin.from('topics').update({ used_at: null }).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'update') {
    if (!body.title?.trim() || !body.category?.trim()) {
      return NextResponse.json({ error: 'Title and category required' }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from('topics')
      .update({
        title: body.title.trim(),
        category: body.category.trim(),
        angle: body.angle?.trim() || null,
      })
      .eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  const { error } = await supabaseAdmin.from('topics').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
