import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Audience preview — given an audience selection, returns:
 *   - selected: how many subscribers match the selection (confirmed only)
 *   - throttled: how many of those received a newsletter in past 7 days
 *   - willSend: selected - throttled (the actual count that will be sent)
 *
 * Used by the publish flow to confirm the real send count BEFORE firing.
 * Mirrors the same throttle logic used by /api/admin/drafts/[id] and
 * /api/admin/newsletter/send.
 *
 * POST body:
 *   { mode: 'all' } — preview the all-confirmed audience
 *   { mode: 'list', ids: string[] } — preview an explicit subscriber list
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  let body: { mode?: 'all' | 'list'; ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const mode = body.mode || 'all';
  const throttleCutoff = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  if (mode === 'list') {
    const ids = (body.ids || []).filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) {
      return NextResponse.json({ selected: 0, throttled: 0, willSend: 0 });
    }

    // Count selected (confirmed only) — chunk to keep .in() URL under limits
    let selected = 0;
    let willSend = 0;
    const URL_CHUNK = 200;
    for (let i = 0; i < ids.length; i += URL_CHUNK) {
      const chunk = ids.slice(i, i + URL_CHUNK);
      // All confirmed in this chunk
      const { count: selCount } = await supabaseAdmin
        .from('subscribers')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'confirmed')
        .in('id', chunk);
      selected += selCount || 0;

      // Confirmed AND not throttled
      const { count: sendCount } = await supabaseAdmin
        .from('subscribers')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'confirmed')
        .or(`last_sent_at.is.null,last_sent_at.lt.${throttleCutoff}`)
        .in('id', chunk);
      willSend += sendCount || 0;
    }

    return NextResponse.json({
      selected,
      throttled: selected - willSend,
      willSend,
    });
  }

  // mode === 'all'
  const { count: selected } = await supabaseAdmin
    .from('subscribers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'confirmed');

  const { count: willSend } = await supabaseAdmin
    .from('subscribers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .or(`last_sent_at.is.null,last_sent_at.lt.${throttleCutoff}`);

  return NextResponse.json({
    selected: selected || 0,
    throttled: (selected || 0) - (willSend || 0),
    willSend: willSend || 0,
  });
}
