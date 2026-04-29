import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateTopics } from '@/lib/anthropic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/topics/generate
 *
 * Generates N new topic ideas using Claude, avoiding duplicates of existing topics
 * (used or unused) in the database. Inserts them into the topics table as unused.
 *
 * Auth is handled by middleware.ts.
 *
 * Request body: { count?: number }  (default 8)
 */
export async function POST(req: NextRequest) {
  let body: { count?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const count = Math.max(1, Math.min(50, body.count ?? 8));

  // Pull all existing topic titles to avoid duplicates
  const { data: existingTopics } = await supabaseAdmin
    .from('topics')
    .select('title');
  const existingTitles = (existingTopics || []).map((t) => t.title as string);

  let topics;
  try {
    topics = await generateTopics({ count, existingTitles });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Topic generation failed';
    console.error('[topics/generate] failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Insert all new topics
  const rows = topics.map((t) => ({
    title: t.title,
    category: t.category,
    angle: t.angle,
  }));

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('topics')
    .insert(rows)
    .select();

  if (insertError) {
    console.error('[topics/generate] insert failed:', insertError);
    return NextResponse.json(
      { error: `Topics generated but DB insert failed: ${insertError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    inserted: inserted?.length ?? 0,
    topics: inserted ?? [],
  });
}
