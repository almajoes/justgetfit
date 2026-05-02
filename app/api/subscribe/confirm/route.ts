import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendNewSubscriberNotification } from '@/lib/resend';
import { getSiteSettings } from '@/lib/cms';

/**
 * GET /api/subscribe/confirm?token=<confirmation_token>
 *
 * Called when a subscriber clicks the verification link in their confirmation
 * email. Flips their status from 'pending' → 'confirmed' and pings the site
 * owner with a notification email so growth is visible in real time.
 *
 * Notification fires only on the FIRST confirmation per subscriber:
 *   - Already-confirmed subscribers (line ~38) hit the early-return BEFORE
 *     the notification call, so no duplicate emails for re-clicks of an old
 *     verification link.
 *   - Admin imports and manual adds insert directly as 'confirmed' and never
 *     hit this route, so bulk imports don't fire 10,000 owner emails.
 *
 * The notification is fire-and-forget (no await) so the user's redirect to
 * /subscribe?confirmed=1 happens immediately even if Resend's API is slow.
 * If the email fails, we just log; the subscriber is already confirmed and
 * that's what matters.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(new URL('/subscribe?status=invalid', req.url));
  }

  const { data: subscriber } = await supabaseAdmin
    .from('subscribers')
    .select('id, email, status, source')
    .eq('confirmation_token', token)
    .maybeSingle();

  if (!subscriber) {
    return NextResponse.redirect(new URL('/subscribe?status=invalid', req.url));
  }

  if (subscriber.status === 'confirmed') {
    // Already confirmed — don't re-notify, don't update DB.
    return NextResponse.redirect(new URL('/subscribe?confirmed=1', req.url));
  }

  // Flip to confirmed
  await supabaseAdmin
    .from('subscribers')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', subscriber.id);

  // Owner notification — register with waitUntil so Vercel keeps the function
  // alive past the redirect response until Resend's API call completes.
  // Without waitUntil, an unawaited promise gets killed when the function
  // returns, and the email never goes out (same bug pattern as fix #50).
  // Lazy-loaded to fail open in non-Vercel runtimes (e.g. local dev).
  const notifyPromise = notifyOwnerNewSubscriber(subscriber.email, subscriber.source).catch(
    (err) => console.error('[confirm] owner notification failed:', err)
  );
  try {
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(notifyPromise);
  } catch {
    // Non-Vercel fallback: await it. Blocks the redirect briefly but ensures
    // the email goes out. Local dev hits this path.
    await notifyPromise;
  }

  return NextResponse.redirect(new URL('/subscribe?confirmed=1', req.url));
}

/**
 * Send the site owner an email about a newly-confirmed subscriber. Resolves
 * `to` from CONTACT_EMAIL env var first (for ops continuity with the contact
 * form notification) falling back to the site_settings.contact_email CMS
 * value.
 *
 * Includes the current total confirmed count for context — gives a real-time
 * sense of list growth.
 */
async function notifyOwnerNewSubscriber(subscriberEmail: string, source: string | null) {
  const site = await getSiteSettings();
  const toEmail = process.env.CONTACT_EMAIL || site.contact_email;
  if (!toEmail) {
    console.warn('[confirm] no CONTACT_EMAIL or site.contact_email — skipping owner notification');
    return;
  }

  // Get current confirmed count for the notification body. Uses HEAD count
  // (no row data shipped) for efficiency.
  const { count } = await supabaseAdmin
    .from('subscribers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'confirmed');

  await sendNewSubscriberNotification({
    toEmail,
    subscriberEmail,
    source,
    totalConfirmed: count ?? 0,
  });
}
