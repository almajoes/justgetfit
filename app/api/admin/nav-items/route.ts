import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.location || !body.label || !body.url) {
    return NextResponse.json({ error: 'location, label, url are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('nav_items')
    .insert({
      location: body.location,
      label: body.label,
      url: body.url,
      is_cta: !!body.is_cta,
      sort_order: body.sort_order ?? 0,
      active: body.active !== false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath('/');
  revalidatePath('/about');
  revalidatePath('/contact');
  revalidatePath('/subscribe');
  revalidatePath('/partners');

  return NextResponse.json({ ok: true, item: data });
}
