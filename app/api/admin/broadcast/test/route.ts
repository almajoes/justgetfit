import { NextRequest, NextResponse } from 'next/server';
import { sendBroadcastEmail } from '@/lib/resend';
import { generateToken } from '@/lib/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/broadcast/test
 *
 * Sends a preview broadcast to a single email address for testing before the full blast.
 * Doesn't log to newsletter_sends. Uses a throwaway unsubscribe token (test only).
 */
export async function POST(req: NextRequest) {
  let body: { subject?: string; body_markdown?: string; to_email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const subject = (body.subject || '').trim();
  const bodyMarkdown = (body.body_markdown || '').trim();
  const toEmail = (body.to_email || '').trim().toLowerCase();

  if (!subject) return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
  if (!bodyMarkdown) return NextResponse.json({ error: 'Body is required' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }

  const result = await sendBroadcastEmail({
    email: toEmail,
    unsubscribeToken: generateToken(), // throwaway — won't match any real subscriber
    subject: `[TEST] ${subject}`,
    bodyMarkdown,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Send failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
