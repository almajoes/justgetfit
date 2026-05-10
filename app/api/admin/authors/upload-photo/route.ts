import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 2 MB request body cap — slightly above the 1.5MB-ish ceiling we
// expect from a 400×400 webp encoded at q=85. The bucket itself caps at
// 2 MB too (db/migration_author_photos_bucket.sql). Keeping the API
// route in sync so we surface a clean 413 rather than an opaque
// Supabase error.
export const maxDuration = 30;

/**
 * POST /api/admin/authors/upload-photo
 *
 * Body: multipart/form-data with `file` (image/webp, image/jpeg, image/png).
 *
 * Stores the file in the `author-photos` Supabase Storage bucket under a
 * generated key, returns the public URL. The client (AuthorsClient) is
 * responsible for resizing + re-encoding to webp BEFORE upload — this
 * route doesn't transform bytes, just stores them. That keeps the server
 * simple (no `sharp` dep), and resizing on the user's browser is fast
 * for the small images we deal with here.
 *
 * Auth: admin only. The bucket's RLS policy permits writes only via
 * service_role, which is what supabaseAdmin uses, so anon clients can't
 * bypass this route to upload directly.
 *
 * Response: { ok: true, url: 'https://...supabase.co/storage/v1/object/public/...' }
 */

const ALLOWED_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function POST(req: NextRequest) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json({ error: 'Expected multipart/form-data with `file`' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Allowed: webp, jpeg, png.` },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${file.size} bytes). Max: ${MAX_BYTES} bytes (2 MB).` },
      { status: 413 }
    );
  }

  // Convert the File (Web API) into a Buffer for the Supabase upload call.
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Path: random uuid + extension. We don't reuse author slug-based paths
  // because the same author might upload several photos over time and we
  // want each to be independently cacheable. The DB row's photo_url
  // points to whichever upload is current.
  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg';
  const objectKey = `${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabaseAdmin
    .storage
    .from('author-photos')
    .upload(objectKey, buffer, {
      contentType: file.type,
      cacheControl: '31536000', // 1 year — file is named uniquely so cache-busting isn't an issue
      upsert: false,
    });

  if (uploadError) {
    console.error('[upload-photo] storage upload failed:', uploadError.message);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Public URL is deterministic from the bucket + path because the bucket
  // is public. We use getPublicUrl() rather than constructing manually so
  // any future Supabase URL-shape changes flow through automatically.
  const { data: urlData } = supabaseAdmin
    .storage
    .from('author-photos')
    .getPublicUrl(objectKey);

  return NextResponse.json({ ok: true, url: urlData.publicUrl, key: objectKey });
}
