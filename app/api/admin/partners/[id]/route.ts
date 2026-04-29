import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { error } = await supabaseAdmin
    .from('partners')
    .update({
      name: body.name,
      blurb: body.blurb,
      url: body.url,
      tag: body.tag || null,
      image_url: body.image_url || null,
      image_gradient: body.image_gradient || null,
      initials: body.initials || null,
      position: body.position,
      is_active: body.is_active !== false,
    })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath('/partners');
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  const { error } = await supabaseAdmin.from('partners').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath('/partners');
  return NextResponse.json({ ok: true });
}
