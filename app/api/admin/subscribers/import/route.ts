import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateToken } from '@/lib/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HARD_CAP = 5000; // refuse imports above this size to avoid Vercel timeout / DB stress

/**
 * POST /api/admin/subscribers/import
 *
 * Bulk-imports subscribers, marking them as 'confirmed' immediately.
 * No confirmation emails sent — caller is asserting these have already opted in.
 *
 * Request body:
 *   { emails: string[], source?: string }
 *
 * Response:
 *   { inserted, alreadyExisted, errors }
 */
export async function POST(req: NextRequest) {
  let body: { emails?: unknown; source?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.emails)) {
    return NextResponse.json({ error: 'emails must be an array of strings' }, { status: 400 });
  }

  const source = typeof body.source === 'string' && body.source.trim() ? body.source.trim().slice(0, 80) : 'import';

  // Server-side validation + dedup. We trust nothing from the client.
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of body.emails) {
    if (typeof raw !== 'string') continue;
    const lower = raw.trim().toLowerCase();
    if (!EMAIL_REGEX.test(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    cleaned.push(lower);
  }

  if (cleaned.length === 0) {
    return NextResponse.json({ error: 'No valid emails to import' }, { status: 400 });
  }
  if (cleaned.length > HARD_CAP) {
    return NextResponse.json(
      { error: `Cannot import more than ${HARD_CAP} at a time. Split your list and try again.` },
      { status: 400 }
    );
  }

  // Find which emails already exist so we can report them separately.
  // We page through in chunks of 1000 to avoid hitting Postgres IN-clause limits.
  const existing = new Set<string>();
  for (let i = 0; i < cleaned.length; i += 1000) {
    const slice = cleaned.slice(i, i + 1000);
    const { data, error } = await supabaseAdmin
      .from('subscribers')
      .select('email')
      .in('email', slice);
    if (error) {
      return NextResponse.json({ error: `Lookup failed: ${error.message}` }, { status: 500 });
    }
    (data || []).forEach((r) => existing.add(r.email as string));
  }

  const toInsert = cleaned.filter((e) => !existing.has(e));

  // Build rows. Each subscriber needs a unique confirmation_token + unsubscribe_token
  // (NOT NULL in schema). The unsubscribe_token is what gets used in the
  // unsubscribe link footer of newsletters, so it must be unique per subscriber.
  const now = new Date().toISOString();
  const rows = toInsert.map((email) => ({
    email,
    status: 'confirmed' as const,
    confirmation_token: generateToken(),
    unsubscribe_token: generateToken(),
    source,
    subscribed_at: now,
    confirmed_at: now,
  }));

  // Insert in batches of 500 to keep payloads small and avoid timeouts on bigger lists.
  const errors: string[] = [];
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error, data } = await supabaseAdmin
      .from('subscribers')
      .insert(batch)
      .select('id');
    if (error) {
      // Per-batch error — record it but keep trying remaining batches
      errors.push(`Batch ${Math.floor(i / 500) + 1}: ${error.message}`);
      continue;
    }
    inserted += data?.length ?? 0;
  }

  return NextResponse.json({
    inserted,
    alreadyExisted: existing.size,
    errors,
  });
}
