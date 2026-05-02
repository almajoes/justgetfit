import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/inbox/action
 *
 * Toggles inbox state on a contact message. Body shape:
 *
 *   { id: string, action: 'read' | 'unread' | 'archive' | 'unarchive' | 'delete' | 'restore' }
 *
 * Routes:
 *   read       → read_at = now()
 *   unread     → read_at = null
 *   archive    → archived_at = now()
 *   unarchive  → archived_at = null
 *   delete     → deleted_at = now()  (soft delete; row stays in DB)
 *   restore    → deleted_at = null
 *
 * Auth: relies on existing admin middleware (HTTP basic auth on /admin and
 * /api/admin/* paths). No additional auth check here.
 */
export async function POST(req: NextRequest) {
  let body: { id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = (body.id ?? '').toString().trim();
  const action = (body.action ?? '').toString().trim();
  if (!id || !action) {
    return NextResponse.json({ error: 'id and action are required' }, { status: 400 });
  }

  let update: Record<string, string | null>;
  switch (action) {
    case 'read':
      update = { read_at: new Date().toISOString() };
      break;
    case 'unread':
      update = { read_at: null };
      break;
    case 'archive':
      update = { archived_at: new Date().toISOString() };
      break;
    case 'unarchive':
      update = { archived_at: null };
      break;
    case 'delete':
      update = { deleted_at: new Date().toISOString() };
      break;
    case 'restore':
      update = { deleted_at: null };
      break;
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('contact_messages')
    .update(update)
    .eq('id', id);

  if (error) {
    console.error(`[inbox/action] ${action} on ${id} failed:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
