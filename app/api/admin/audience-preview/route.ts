import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildThrottleExclusions } from '@/lib/throttle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Audience preview — given an audience selection, returns:
 *   - selected:  how many confirmed subscribers match the selection
 *   - throttled: how many of those are excluded by the throttle policy
 *   - willSend:  selected - throttled (the actual count that will be sent)
 *
 * Used by the publish flow to confirm the real send count BEFORE firing.
 * Mirrors the throttle policy in lib/throttle.ts (exclude source='import'
 * subs with >= 2 sends in past 7d). Form-subscribers and any other
 * source-label subscribers are exempt.
 *
 * POST body:
 *   { mode: 'all' } — preview the all-confirmed audience
 *   { mode: 'list', ids: string[] } — preview an explicit subscriber list
 */

export async function POST(req: NextRequest) {
  let body: { mode?: 'all' | 'list'; ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const mode = body.mode || 'all';
  const resolved: { id: string; email: string; source: string | null }[] = [];

  if (mode === 'list') {
    const ids = (body.ids || []).filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) {
      return NextResponse.json({ selected: 0, throttled: 0, willSend: 0 });
    }
    const URL_CHUNK = 200;
    for (let i = 0; i < ids.length; i += URL_CHUNK) {
      const chunk = ids.slice(i, i + URL_CHUNK);
      const { data, error } = await supabaseAdmin
        .from('subscribers')
        .select('id, email, source')
        .eq('status', 'confirmed')
        .in('id', chunk);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      for (const row of (data as { id: string; email: string; source: string | null }[]) || []) {
        resolved.push(row);
      }
    }
  } else {
    // mode === 'all'
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from('subscribers')
        .select('id, email, source')
        .eq('status', 'confirmed')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const batch = (data as { id: string; email: string; source: string | null }[]) || [];
      for (const row of batch) resolved.push(row);
      if (batch.length < PAGE) break;
      from += PAGE;
      if (from > 200000) break;
    }
  }

  const selected = resolved.length;
  const exclusions = await buildThrottleExclusions(resolved);
  const throttled = exclusions.size;
  const willSend = selected - throttled;

  return NextResponse.json({ selected, throttled, willSend });
}
