import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateToken } from '@/lib/tokens';
import { sendConfirmationEmail } from '@/lib/resend';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let email: string;
  let source: string;

  // Accept both JSON and form-encoded submissions
  const contentType = req.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const body = await req.json();
      email = String(body.email || '').trim().toLowerCase();
      source = String(body.source || 'unknown');
    } else {
      const fd = await req.formData();
      email = String(fd.get('email') || '').trim().toLowerCase();
      source = String(fd.get('source') || 'unknown');
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  // Check if subscriber already exists
  const { data: existing } = await supabaseAdmin
    .from('subscribers')
    .select('id, status, email, confirmation_token')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'confirmed') {
      return NextResponse.json({ ok: true, message: "You're already subscribed." });
    }
    if (existing.status === 'unsubscribed') {
      // Re-activate as pending and re-send confirmation
      const newToken = generateToken();
      await supabaseAdmin
        .from('subscribers')
        .update({
          status: 'pending',
          confirmation_token: newToken,
          subscribed_at: new Date().toISOString(),
          unsubscribed_at: null,
          source,
        })
        .eq('id', existing.id);
      await sendConfirmationEmail(email, newToken);
      return NextResponse.json({ ok: true, message: 'Welcome back — check your email for the confirmation link.' });
    }
    if (existing.status === 'pending') {
      // Resend confirmation
      await sendConfirmationEmail(email, existing.confirmation_token);
      return NextResponse.json({ ok: true, message: 'Check your email — we just resent your confirmation link.' });
    }
  }

  // New subscriber
  const confirmation_token = generateToken();
  const unsubscribe_token = generateToken();
  const { error: insertError } = await supabaseAdmin.from('subscribers').insert({
    email,
    status: 'pending',
    confirmation_token,
    unsubscribe_token,
    source,
  });

  if (insertError) {
    return NextResponse.json({ error: 'Could not save subscription. Please try again.' }, { status: 500 });
  }

  const sendResult = await sendConfirmationEmail(email, confirmation_token);
  if (!sendResult.ok) {
    // Subscription is in DB; just warn that we couldn't send the email
    return NextResponse.json({
      ok: true,
      message: "Subscribed, but we couldn't send the confirmation email — please contact us.",
    });
  }

  // For form-encoded submissions (i.e. fallback HTML form), redirect back to subscribe page
  if (!contentType.includes('application/json')) {
    return NextResponse.redirect(new URL('/subscribe?status=pending', req.url));
  }

  return NextResponse.json({ ok: true, message: "Check your email — we sent a confirmation link." });
}
