import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/resend
 *
 * Receives webhook events from Resend (email.delivered, email.opened, email.clicked, etc.)
 * Resend signs requests using svix-style HMAC-SHA256; we verify before processing.
 *
 * Setup (in Resend dashboard):
 *   1. Webhooks → Add Endpoint → URL: https://justgetfit.org/api/webhooks/resend
 *   2. Choose events: email.sent, email.delivered, email.opened, email.clicked,
 *                     email.bounced, email.complained
 *   3. Copy the Signing Secret (starts with "whsec_") → set RESEND_WEBHOOK_SECRET env var on Vercel
 *
 * To attribute events back to a `newsletter_sends` row, the outgoing emails
 * include a `tags` array with `{ name: 'send_id', value: <uuid> }`. Resend
 * echoes that back in the webhook payload as `data.tags`.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read raw body for signature verification
  const payload = await req.text();
  const svixId = req.headers.get('svix-id') ?? '';
  const svixTimestamp = req.headers.get('svix-timestamp') ?? '';
  const svixSignature = req.headers.get('svix-signature') ?? '';

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // Verify timestamp is recent (5 min window) to prevent replay attacks
  const tsNum = parseInt(svixTimestamp, 10);
  if (isNaN(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
    return NextResponse.json({ error: 'Timestamp out of window' }, { status: 400 });
  }

  // Compute expected signature: HMAC-SHA256 of "{id}.{timestamp}.{payload}"
  // using the secret with the "whsec_" prefix stripped and base64-decoded.
  if (!secret.startsWith('whsec_')) {
    console.error('[resend-webhook] secret should start with whsec_');
    return NextResponse.json({ error: 'Bad secret format' }, { status: 500 });
  }
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  // Header is space-separated list of "v1,sig" pairs; check any one matches
  const sigs = svixSignature.split(' ').map((s) => s.split(',')[1]).filter(Boolean);
  const matched = sigs.some((sig) =>
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  );
  if (!matched) {
    console.error('[resend-webhook] signature mismatch');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse payload now that signature is verified
  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Map Resend event type to our internal event_type
  const typeMap: Record<string, string> = {
    'email.sent': 'sent',
    'email.delivered': 'delivered',
    'email.delivery_delayed': 'delivery_delayed',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
  };
  const eventType = typeMap[event.type];
  if (!eventType) {
    // Unknown event type — ack and ignore
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  const data = event.data;

  // Extract send_id from tags. Resend echoes back the tags we attached when sending.
  const sendIdTag = (data.tags || []).find((t) => t.name === 'send_id');
  const sendId = sendIdTag?.value;

  // First recipient (Resend includes an array; we send one email per recipient anyway)
  const recipientEmail = Array.isArray(data.to) ? data.to[0] : data.to;
  if (!recipientEmail) {
    return NextResponse.json({ ok: true, skipped: 'no recipient' });
  }

  // Insert event row. The unique index (send_id, email, event_type) for opened/clicked
  // makes this idempotent: re-deliveries of the same event are silently absorbed.
  const eventRow = {
    send_id: sendId || null,
    event_type: eventType,
    email: recipientEmail,
    resend_email_id: data.email_id || null,
    link_url: 'click' in data ? data.click?.link || null : null,
    user_agent: getUA(data),
    ip: getIP(data),
    occurred_at: data.created_at || event.created_at || new Date().toISOString(),
  };

  const { error: insertErr } = await supabaseAdmin
    .from('email_events')
    .insert(eventRow);

  // 23505 = unique constraint violation = already recorded this open/click. That's fine.
  if (insertErr && insertErr.code !== '23505') {
    console.error('[resend-webhook] insert failed:', insertErr);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Refresh denormalized counters on newsletter_sends if this was an open/click
  // and we have a send_id. Counts are based on UNIQUE recipients, not raw events.
  if (sendId && (eventType === 'opened' || eventType === 'clicked')) {
    await refreshCounters(sendId);
  }

  return NextResponse.json({ ok: true });
}

/**
 * Recompute unique-recipient open/click counts for a single send.
 * Runs whenever a new event arrives so the dashboard stays current
 * without a separate cron.
 */
async function refreshCounters(sendId: string) {
  // Count distinct recipients who opened
  const { data: opens } = await supabaseAdmin
    .from('email_events')
    .select('email')
    .eq('send_id', sendId)
    .eq('event_type', 'opened');
  const uniqueOpens = new Set((opens || []).map((r) => r.email)).size;

  const { data: clicks } = await supabaseAdmin
    .from('email_events')
    .select('email')
    .eq('send_id', sendId)
    .eq('event_type', 'clicked');
  const uniqueClicks = new Set((clicks || []).map((r) => r.email)).size;

  await supabaseAdmin
    .from('newsletter_sends')
    .update({ opened_count: uniqueOpens, clicked_count: uniqueClicks })
    .eq('id', sendId);
}

function getUA(data: ResendEventData): string | null {
  if ('open' in data && data.open?.user_agent) return data.open.user_agent;
  if ('click' in data && data.click?.user_agent) return data.click.user_agent;
  return null;
}

function getIP(data: ResendEventData): string | null {
  if ('open' in data && data.open?.ip_address) return data.open.ip_address;
  if ('click' in data && data.click?.ip_address) return data.click.ip_address;
  return null;
}

// Resend webhook payload shapes
type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data: ResendEventData;
};

type ResendEventData = {
  email_id?: string;
  to?: string | string[];
  from?: string;
  subject?: string;
  created_at?: string;
  tags?: Array<{ name: string; value: string }>;
  click?: { link?: string; user_agent?: string; ip_address?: string };
  open?: { user_agent?: string; ip_address?: string };
};
