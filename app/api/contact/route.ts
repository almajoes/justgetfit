import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendContactNotification } from '@/lib/resend';
import { getSiteSettings } from '@/lib/cms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/contact
 *
 * Spam protection (two layers):
 *   1. Honeypot — if `website` field is non-empty, reject silently with a 200.
 *      We return 200 so the bot thinks it succeeded and doesn't retry. Nothing
 *      is written to the database, no notification email is sent.
 *
 *   2. reCAPTCHA v3 — if RECAPTCHA_SECRET_KEY is configured server-side AND a
 *      token was submitted, verify the token with Google. Reject submissions
 *      with score < RECAPTCHA_MIN_SCORE (default 0.5).
 *
 *      If RECAPTCHA_SECRET_KEY is NOT configured server-side, captcha verification
 *      is skipped entirely (so local dev still works without setup). This means
 *      production MUST set the env var or there's no captcha protection at all.
 */

// reCAPTCHA score threshold. v3 returns 0.0 (bot) to 1.0 (human).
// 0.5 is Google's default recommendation. Lower = more permissive (more spam
// gets through but fewer false positives), higher = stricter (less spam but
// some legit users get blocked, especially on slow connections / privacy
// browsers).
const RECAPTCHA_MIN_SCORE = parseFloat(process.env.RECAPTCHA_MIN_SCORE || '0.5');

export async function POST(request: NextRequest) {
  let body: {
    name?: string;
    email?: string;
    subject?: string;
    message?: string;
    website?: string;
    recaptchaToken?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = (body.name ?? '').toString().trim();
  const email = (body.email ?? '').toString().trim();
  const subject = (body.subject ?? '').toString().trim();
  const message = (body.message ?? '').toString().trim();
  const honeypot = (body.website ?? '').toString().trim();
  const recaptchaToken = (body.recaptchaToken ?? '').toString();

  // ─── Honeypot check ──────────────────────────────────────────────────
  // Real users never fill this field (it's offscreen with tabIndex=-1).
  // Bots that auto-fill all inputs trip this check.
  // Return 200 so the bot thinks it succeeded — don't reveal the trap.
  if (honeypot) {
    console.log(`[contact] honeypot triggered from ${request.headers.get('x-forwarded-for') || 'unknown'}: "${honeypot}"`);
    return NextResponse.json({ ok: true });
  }

  // ─── Basic validation ────────────────────────────────────────────────
  if (!name || !email || !message) {
    return NextResponse.json({ error: 'Name, email, and message are required.' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  // ─── reCAPTCHA verification ──────────────────────────────────────────
  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
  if (recaptchaSecret) {
    if (!recaptchaToken) {
      // Server requires captcha but client didn't send a token. Could happen if:
      //   - Bot bypassed the form by hitting the API directly (most common)
      //   - Real user with the script blocked (rare, mostly extreme privacy setups)
      // Reject with a generic message so we don't reveal the protection.
      return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 400 });
    }

    const verifyResult = await verifyRecaptcha(recaptchaToken, recaptchaSecret);
    if (!verifyResult.ok) {
      console.log(`[contact] reCAPTCHA rejected: ${verifyResult.reason} (score=${verifyResult.score ?? 'n/a'})`);
      return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 400 });
    }
    // Optional: log score for monitoring. Useful while tuning the threshold.
    if (typeof verifyResult.score === 'number') {
      console.log(`[contact] reCAPTCHA passed: score=${verifyResult.score.toFixed(2)}`);
    }
  }

  // ─── Save + notify ───────────────────────────────────────────────────
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

/**
 * Verify a reCAPTCHA v3 token with Google's siteverify endpoint.
 * Returns { ok: true } if score >= RECAPTCHA_MIN_SCORE and action matches.
 *
 * Edge cases handled:
 *   - Network failure to Google → fail closed (return ok: false). Better to
 *     reject a real submission than let spam through during an outage.
 *   - Google says success: false (bad token, expired, malformed) → reject.
 *   - Score is below threshold → reject as likely bot.
 *   - Action mismatch (token was for a different page's submit) → reject.
 *     This catches token replay attacks.
 */
async function verifyRecaptcha(
  token: string,
  secret: string
): Promise<{ ok: true; score?: number } | { ok: false; reason: string; score?: number }> {
  try {
    const params = new URLSearchParams();
    params.append('secret', secret);
    params.append('response', token);

    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) {
      return { ok: false, reason: `Google API returned ${res.status}` };
    }

    const data = (await res.json()) as {
      success: boolean;
      score?: number;
      action?: string;
      'error-codes'?: string[];
    };

    if (!data.success) {
      return { ok: false, reason: `success=false ${(data['error-codes'] || []).join(',')}` };
    }
    if (typeof data.score === 'number' && data.score < RECAPTCHA_MIN_SCORE) {
      return { ok: false, reason: 'score below threshold', score: data.score };
    }
    if (data.action && data.action !== 'contact') {
      return { ok: false, reason: `action mismatch: ${data.action}` };
    }
    return { ok: true, score: data.score };
  } catch (err) {
    console.error('[recaptcha] verification network error:', err);
    return { ok: false, reason: 'network error' };
  }
}
