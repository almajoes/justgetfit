import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: { site?: unknown; footer?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: { key: string; value: unknown }[] = [];
  if (body.site) updates.push({ key: 'site', value: body.site });
  if (body.footer) updates.push({ key: 'footer', value: body.footer });

  for (const u of updates) {
    const { error } = await supabaseAdmin
      .from('settings')
      .upsert({ key: u.key, value: u.value }, { onConflict: 'key' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Both site + footer affect every page — revalidate broadly
  ['/', '/about', '/contact', '/subscribe', '/partners', '/articles', '/categories'].forEach((p) =>
    revalidatePath(p)
  );

  return NextResponse.json({ ok: true });
}
