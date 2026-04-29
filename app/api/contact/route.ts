import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendContactNotification } from '@/lib/resend';
import { getSiteSettings } from '@/lib/cms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { name?: string; email?: string; subject?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = (body.name ?? '').toString().trim();
  const email = (body.email ?? '').toString().trim();
  const subject = (body.subject ?? '').toString().trim();
  const message = (body.message ?? '').toString().trim();

  if (!name || !email || !message) {
    return NextResponse.json({ error: 'Name, email, and message are required.' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  // Save to DB regardless of email delivery
  try {
    await supabaseAdmin.from('contact_messages').insert({
      name,
      email,
      subject: subject || null,
      message,
    });
  } catch (err) {
    console.error('Failed to save contact message:', err);
  }

  // Send notification to site owner
  const site = await getSiteSettings();
  const toEmail = process.env.CONTACT_EMAIL || site.contact_email;
  if (toEmail) {
    await sendContactNotification({
      toEmail,
      name,
      fromEmail: email,
      subject,
      message,
    });
  }

  return NextResponse.json({ ok: true });
}
