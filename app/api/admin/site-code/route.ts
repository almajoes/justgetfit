import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PUT /api/admin/site-code
 *
 * Saves the site code injection settings (meta tags + head/body scripts).
 * Auth handled by middleware.ts.
 *
 * Body shape:
 *   { meta_tags: string, head_scripts: string, body_scripts: string }
 */
export async function PUT(req: NextRequest) {
  let body: { meta_tags?: unknown; head_scripts?: unknown; body_scripts?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Coerce to strings — never trust unknown JSON
  const value = {
    meta_tags: typeof body.meta_tags === 'string' ? body.meta_tags : '',
    head_scripts: typeof body.head_scripts === 'string' ? body.head_scripts : '',
    body_scripts: typeof body.body_scripts === 'string' ? body.body_scripts : '',
  };

  // Hard cap on size to prevent runaway content (1MB total)
  const totalSize = value.meta_tags.length + value.head_scripts.length + value.body_scripts.length;
  if (totalSize > 1_000_000) {
    return NextResponse.json({ error: 'Total content exceeds 1MB limit' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('settings')
    .upsert({ key: 'site_code', value }, { onConflict: 'key' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Revalidate the root layout (which renders these into <head>) so the public
  // site reflects the change ASAP. revalidatePath('/') re-renders all pages
  // since they all share the root layout.
  revalidatePath('/', 'layout');

  return NextResponse.json({ ok: true });
}
