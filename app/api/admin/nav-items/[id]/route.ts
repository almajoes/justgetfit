import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function revalidateAll() {
  ['/', '/about', '/contact', '/subscribe', '/partners', '/categories', '/articles'].forEach((p) =>
    revalidatePath(p)
  );
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('nav_items')
    .update({
      label: body.label,
      url: body.url,
      is_cta: !!body.is_cta,
      new_tab: !!body.new_tab,
      sort_order: body.sort_order,
      active: body.active !== false,
    })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateAll();
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  const { error } = await supabaseAdmin.from('nav_items').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateAll();
  return NextResponse.json({ ok: true });
}
