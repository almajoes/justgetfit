import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_SLUGS = ['home-hero', 'about', 'subscribe', 'contact', 'app'];

const REVALIDATE_PATHS: Record<string, string[]> = {
  'home-hero': ['/'],
  about: ['/about'],
  subscribe: ['/subscribe'],
  contact: ['/contact'],
  app: ['/app'],
};

export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  if (!ALLOWED_SLUGS.includes(params.slug)) {
    return NextResponse.json({ error: 'Invalid page slug' }, { status: 400 });
  }

  let body: { content: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.content || typeof body.content !== 'object') {
    return NextResponse.json({ error: 'Missing content' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('pages')
    .upsert({ slug: params.slug, content: body.content }, { onConflict: 'slug' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Revalidate the affected public route(s)
  const paths = REVALIDATE_PATHS[params.slug] || [];
  paths.forEach((p) => revalidatePath(p));

  return NextResponse.json({ ok: true });
}
