import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendConfirmationEmail } from '@/lib/resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  let action: string;
  try {
    const body = await req.json();
    action = String(body.action || '');
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: sub } = await supabaseAdmin
    .from('subscribers')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (action === 'resend_confirmation') {
    await sendConfirmationEmail(sub.email, sub.confirmation_token);
    return NextResponse.json({ ok: true });
  }

  // Manually mark a pending subscriber as confirmed without requiring them to
  // click the email link. Use sparingly — only when you're certain the person
  // wants to subscribe (e.g. they emailed you saying they didn't get the
  // confirmation email). Sets confirmed_at to now so audit trails are accurate.
  if (action === 'confirm') {
    await supabaseAdmin
      .from('subscribers')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        // Clear unsubscribed_at if they were previously unsubscribed and we're
        // forcing them back on. (Resubscribe path uses the same code.)
        unsubscribed_at: null,
      })
      .eq('id', params.id);
    return NextResponse.json({ ok: true });
  }

  if (action === 'unsubscribe') {
    await supabaseAdmin
      .from('subscribers')
      .update({
        status: 'unsubscribed',
        unsubscribed_at: new Date().toISOString(),
      })
      .eq('id', params.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = checkAdminAuth();
  if (!auth.ok) return auth.response;

  await supabaseAdmin.from('subscribers').delete().eq('id', params.id);
  return NextResponse.json({ ok: true });
}
