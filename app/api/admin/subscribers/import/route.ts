import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateToken } from '@/lib/tokens';
import { markViewed } from '@/lib/admin-counts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5-minute timeout for big imports (10k+ rows)
const HARD_CAP = 25000; // refuse imports above this — split into multiple runs if needed

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/admin/subscribers/import
 *
 * Bulk-imports subscribers, marking them as 'confirmed' immediately.
 * No confirmation emails sent — caller is asserting these have already opted in.
 *
 * Strategy: Instead of pre-checking for duplicates with IN clauses (which hit
 * URL length limits with large lists), we attempt the insert and rely on the
 * unique constraint on `subscribers.email` to reject duplicates. PostgreSQL's
 * `ON CONFLICT DO NOTHING` is perfect for this — supabase-js exposes it as
 * `upsert(..., { onConflict: 'email', ignoreDuplicates: true })`.
 *
 * To report how many were duplicates vs new, we count the rows actually
 * inserted (the .select() return) and compute the difference.
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

  const source =
    typeof body.source === 'string' && body.source.trim()
      ? body.source.trim().slice(0, 80)
      : 'import';

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

  // Build all rows up front. Each subscriber needs a unique confirmation_token + unsubscribe_token
  // (NOT NULL in schema). The unsubscribe_token is what gets used in the
  // unsubscribe link footer of newsletters, so it must be unique per subscriber.
  const now = new Date().toISOString();
  const rows = cleaned.map((email) => ({
    email,
    status: 'confirmed' as const,
    confirmation_token: generateToken(),
    unsubscribe_token: generateToken(),
    source,
    subscribed_at: now,
    confirmed_at: now,
  }));

  // Insert in batches of 500. Use upsert with ignoreDuplicates so existing
  // emails are silently skipped instead of failing the batch. The .select('id')
  // returns ONLY the rows actually inserted, which is how we count new vs. dup.
  const errors: string[] = [];
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { data, error } = await supabaseAdmin
      .from('subscribers')
      .upsert(batch, { onConflict: 'email', ignoreDuplicates: true })
      .select('id');
    if (error) {
      // Per-batch error — record it but keep trying remaining batches
      errors.push(`Batch ${Math.floor(i / 500) + 1}: ${error.message}`);
      continue;
    }
    inserted += data?.length ?? 0;
  }

  // Anything that wasn't inserted was either a duplicate of an existing row
  // OR landed in a failed batch. We don't try to distinguish — duplicates are
  // expected, batch failures are reported via the errors array.
  const alreadyExisted = cleaned.length - inserted - errors.length * 500;

  // Bump the subscribers last-viewed timestamp so the sidebar counter doesn't
  // fire for these admin-imported rows. The counter is meant to alert on
  // organic public-form signups; admin imports are intentional bulk operations
  // the user already knows about. Without this, every import would spike the
  // counter to the import size (e.g. importing 1000 → counter shows 1000).
  await markViewed('subscribers');

  return NextResponse.json({
    inserted,
    alreadyExisted: Math.max(0, alreadyExisted),
    errors,
  });
}
