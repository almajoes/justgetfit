import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: { title: string; category: string; angle?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }

  if (!body.title?.trim() || !body.category?.trim()) {
    return NextResponse.json({ error: 'Title and category required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('topics').insert({
    title: body.title.trim(),
    category: body.category.trim(),
    angle: body.angle?.trim() || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
