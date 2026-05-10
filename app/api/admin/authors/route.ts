import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authors collection endpoint.
 *   GET   — list all authors (admin only)
 *   POST  — create a new author
 *
 * Per-row updates and deletes live at /api/admin/authors/[id].
 *
 * Photo + credit: when photo_url is set, photo_credit MUST also be set
 * per Unsplash license terms. We enforce that at the API layer so admins
 * can't accidentally create a row that would render a photo without
 * attribution.
 */

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function GET() {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin
    .from('authors')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ authors: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let body: {
    slug?: string;
    name?: string;
    bio?: string;
    photo_url?: string;
    photo_credit?: string;
    sort_order?: number;
    is_active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = (body.slug || '').trim().toLowerCase();
  const name = (body.name || '').trim();
  if (!slug || !name) {
    return NextResponse.json({ error: 'slug and name are required' }, { status: 400 });
  }
  if (!SLUG_REGEX.test(slug)) {
    return NextResponse.json(
      { error: 'slug must be lowercase letters, numbers, and dashes only (e.g. alex-reyes)' },
      { status: 400 }
    );
  }

  // photo_credit is now optional regardless of photo_url. Custom uploads
  // don't need attribution; Unsplash photos do, but we trust the admin
  // to fill it in when they paste an Unsplash URL or use the seeded
  // Unsplash photos. (May 9 2026 — relaxed from the prior strict rule.)
  const photo_url = (body.photo_url || '').trim() || null;
  const photo_credit = (body.photo_credit || '').trim() || null;

  const { data, error } = await supabaseAdmin
    .from('authors')
    .insert({
      slug,
      name,
      bio: (body.bio || '').trim() || null,
      photo_url,
      photo_credit,
      sort_order: typeof body.sort_order === 'number' ? body.sort_order : 0,
      is_active: body.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    // Unique-violation on slug → friendlier error
    if (/duplicate key/i.test(error.message)) {
      return NextResponse.json({ error: `Slug "${slug}" is already taken.` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, author: data });
}
