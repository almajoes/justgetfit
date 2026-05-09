import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || 'Just Get Fit <hello@justgetfit.org>';
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://justgetfit.org';

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

// =============================================================================
// CRITICAL: sendWithRetry — proper error handling + rate-limit retry
// =============================================================================
// The Resend SDK's emails.send() does NOT throw on API errors. It returns
// `{ data, error }` where `error` is non-null on failure. Previously our
// wrapper functions just `await`ed without inspecting the result, which meant
// rate-limit errors (429), validation errors, and authentication errors all
// silently returned `ok: true` to the caller. This caused the May 4 incident
// where the worker reported "100/100 processed" but Resend only received 45
// of those calls — the other 55 were rate-limited and silently dropped.
//
// This helper:
//   1. Inspects the response and treats `error` as failure
//   2. Retries on rate-limit errors with exponential backoff (Resend free tier
//      limit is 2 req/sec; we observe transient 429s under load even on Pro)
//   3. Returns a real ok/error result that the worker can act on
//
// Pacing: caller should still rate-limit themselves to ~10 req/sec. This
// retry handles bursts and brief spikes; sustained over-rate would cause
// retries to also fail.
type SendResult = { ok: true } | { ok: false; error: string };

async function sendWithRetry(
  payload: Parameters<NonNullable<typeof resend>['emails']['send']>[0],
  maxRetries = 3
): Promise<SendResult> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await resend.emails.send(payload);
      // Resend SDK returns { data, error }. Both fields are present on the
      // response object; `error` is non-null on API failure.
      if (response && 'error' in response && response.error) {
        const errName = (response.error as { name?: string }).name || '';
        const errMessage = (response.error as { message?: string }).message || JSON.stringify(response.error);

        // Rate-limit errors: backoff and retry
        const isRateLimit =
          errName === 'rate_limit_exceeded' ||
          errMessage.toLowerCase().includes('rate limit') ||
          errMessage.toLowerCase().includes('too many requests');

        if (isRateLimit && attempt < maxRetries) {
          // Exponential backoff: 500ms, 1s, 2s
          const delay = 500 * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        return { ok: false, error: `${errName || 'resend_error'}: ${errMessage}` };
      }
      // Success — Resend returned data, no error
      return { ok: true };
    } catch (err) {
      // Network errors etc. — retry network issues; bail on others
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const isTransient =
        msg.toLowerCase().includes('econnreset') ||
        msg.toLowerCase().includes('etimedout') ||
        msg.toLowerCase().includes('fetch failed') ||
        msg.toLowerCase().includes('network');

      if (isTransient && attempt < maxRetries) {
        const delay = 500 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return { ok: false, error: msg };
    }
  }
  return { ok: false, error: 'Exhausted retries' };
}


// =============================================================================
// BRAND COLORS — kept in sync with app/globals.css CSS variables
// =============================================================================
const BRAND = {
  bgDark: '#050507',
  bgPanel: '#0e0e12',
  bgWhite: '#ffffff',
  text: '#1a1a1a',
  textMuted: '#666666',
  textFaint: '#999999',
  textVeryFaint: '#bbbbbb',
  textOnDark: '#f4f4f6',
  textOnDarkMuted: 'rgba(244,244,246,0.7)',
  neon: '#c4ff3d',
  neon2: '#00e5ff',
  line: '#e5e5e5',
  lineDark: 'rgba(244,244,246,0.12)',
};

// =============================================================================
// SHARED EMAIL SHELL
//
// Every email Just Get Fit sends — confirmation, newsletter, broadcast, contact
// notification — is wrapped in this shell so the brand identity is consistent.
//
// Structure:
//   1. Outer table (Outlook-safe centering)
//   2. Branded header (dark bg, JGF wordmark in neon green, tagline)
//   3. Optional category strip (newsletter only)
//   4. White body container with comfortable padding
//   5. Branded footer (dark bg, nav links, unsubscribe, brand line)
//
// All inline styles. No external CSS. No images (avoids Gmail's "Show images"
// hiding). The wordmark is rendered as styled text instead of an image.
// =============================================================================

type ShellOpts = {
  preheader?: string; // Hidden preview text (Gmail/Apple Mail show this in inbox list)
  innerHtml: string;
  unsubscribeUrl?: string; // Show "Unsubscribe in one click" footer link
  showFooterNav?: boolean; // Show home/articles/about/contact links in footer
};

function brandedShell(opts: ShellOpts): string {
  const { preheader, innerHtml, unsubscribeUrl, showFooterNav = true } = opts;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>Just Get Fit</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bgDark};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${BRAND.text};-webkit-font-smoothing:antialiased;">

<!-- Hidden preheader (preview text in inbox list) -->
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.bgDark};">${escapeHtml(preheader)}</div>` : ''}

<!-- Outer wrapper: dark band -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.bgDark};">
  <tr>
    <td align="center" style="padding:0;">

      <!-- Constrained inner table -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">

        <!-- HEADER -->
        <tr>
          <td align="center" style="padding:32px 24px 24px;background:${BRAND.bgDark};">
            <a href="${siteUrl}" style="text-decoration:none;display:inline-block;">
              <span style="display:inline-block;font-size:28px;font-weight:800;letter-spacing:-0.02em;color:${BRAND.textOnDark};vertical-align:middle;">J</span><span style="display:inline-block;font-size:28px;font-weight:800;letter-spacing:-0.02em;color:${BRAND.neon};vertical-align:middle;">G</span><span style="display:inline-block;font-size:28px;font-weight:800;letter-spacing:-0.02em;color:${BRAND.textOnDark};vertical-align:middle;">F</span>
              <span style="display:inline-block;height:18px;width:1px;background:${BRAND.lineDark};margin:0 12px;vertical-align:middle;"></span>
              <span style="display:inline-block;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:${BRAND.textOnDarkMuted};vertical-align:middle;">Just Get Fit</span>
            </a>
            <div style="font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.neon};margin-top:8px;font-style:italic;">Stronger. Every day.</div>
          </td>
        </tr>

        <!-- BODY (white card) -->
        <tr>
          <td style="background:${BRAND.bgWhite};padding:40px 32px;border-radius:0;">
            ${innerHtml}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td align="center" style="background:${BRAND.bgDark};padding:32px 24px;color:${BRAND.textOnDarkMuted};">

            ${showFooterNav ? `
            <div style="margin-bottom:20px;">
              <a href="${siteUrl}" style="color:${BRAND.textOnDarkMuted};text-decoration:none;font-size:12px;margin:0 10px;letter-spacing:0.04em;">Home</a>
              <a href="${siteUrl}/articles" style="color:${BRAND.textOnDarkMuted};text-decoration:none;font-size:12px;margin:0 10px;letter-spacing:0.04em;">Articles</a>
              <a href="${siteUrl}/categories" style="color:${BRAND.textOnDarkMuted};text-decoration:none;font-size:12px;margin:0 10px;letter-spacing:0.04em;">Categories</a>
              <a href="${siteUrl}/about" style="color:${BRAND.textOnDarkMuted};text-decoration:none;font-size:12px;margin:0 10px;letter-spacing:0.04em;">About</a>
              <a href="${siteUrl}/contact" style="color:${BRAND.textOnDarkMuted};text-decoration:none;font-size:12px;margin:0 10px;letter-spacing:0.04em;">Contact</a>
            </div>
            <div style="height:1px;background:${BRAND.lineDark};margin:0 0 20px;"></div>
            ` : ''}

            <p style="margin:0 0 6px;font-size:12px;color:${BRAND.textOnDarkMuted};line-height:1.6;">
              <strong style="color:${BRAND.textOnDark};font-weight:600;">Just Get Fit</strong> &mdash; <em style="font-style:italic;color:${BRAND.neon};">Stronger. Every day.</em>
            </p>
            <p style="margin:0 0 16px;font-size:11px;color:rgba(244,244,246,0.45);line-height:1.6;">
              Evidence-based fitness writing. Nothing here is medical advice.
            </p>

            ${unsubscribeUrl ? `
            <p style="margin:16px 0 0;font-size:11px;color:rgba(244,244,246,0.4);line-height:1.6;">
              You got this email because you subscribed to Just Get Fit.<br/>
              <a href="${unsubscribeUrl}" style="color:rgba(244,244,246,0.6);text-decoration:underline;">Unsubscribe in one click</a> &middot;
              <a href="${siteUrl}" style="color:rgba(244,244,246,0.6);text-decoration:underline;">${siteUrl.replace(/^https?:\/\//, '')}</a>
            </p>
            ` : ''}

          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}

// =============================================================================
// HELPERS
// =============================================================================

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Strip HTML tags and decode entities for plain-text email fallback.
 * Plain-text fallback materially improves deliverability (Gmail, Apple Mail).
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Convert a simple Markdown subset to HTML for broadcast email bodies.
 * Supports: paragraphs, **bold**, *italic*, [text](url), ## h2, ### h3, > blockquote, lists.
 */
function markdownToHtml(md: string): string {
  let html = md.trim();
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  html = html.replace(/^### (.+)$/gm, `<h3 style="font-size:18px;font-weight:700;margin:28px 0 12px;color:${BRAND.bgDark};letter-spacing:-0.01em;">$1</h3>`);
  html = html.replace(/^## (.+)$/gm, `<h2 style="font-size:24px;font-weight:800;margin:32px 0 16px;color:${BRAND.bgDark};letter-spacing:-0.02em;">$1</h2>`);
  html = html.replace(/^&gt; (.+)$/gm, `<blockquote style="border-left:3px solid ${BRAND.neon};padding:8px 16px;margin:20px 0;color:${BRAND.textMuted};font-style:italic;background:rgba(196,255,61,0.05);">$1</blockquote>`);
  html = html.replace(/\*\*(.+?)\*\*/g, `<strong style="color:${BRAND.bgDark};font-weight:700;">$1</strong>`);
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" style="color:${BRAND.bgDark};font-weight:600;text-decoration:underline;text-decoration-color:${BRAND.neon};text-decoration-thickness:2px;text-underline-offset:3px;">$1</a>`);

  html = html.replace(/(^- .+(?:\n- .+)*)/gm, (match) => {
    const items = match.split('\n').map((l) => `<li style="margin:6px 0;color:${BRAND.text};">${l.replace(/^- /, '')}</li>`).join('');
    return `<ul style="margin:20px 0;padding-left:24px;color:${BRAND.text};">${items}</ul>`;
  });

  const blocks = html.split(/\n\s*\n/);
  html = blocks.map((b) => {
    const trimmed = b.trim();
    if (!trimmed) return '';
    if (/^<(h[1-6]|ul|ol|blockquote|p|div)/.test(trimmed)) return trimmed;
    return `<p style="margin:0 0 18px;line-height:1.7;color:${BRAND.text};font-size:16px;">${trimmed.replace(/\n/g, '<br/>')}</p>`;
  }).join('\n');

  return html;
}

// =============================================================================
// EMAIL TYPES
// =============================================================================

/**
 * Send a confirmation email when someone subscribes.
 * Uses the branded shell. No unsubscribe footer (this email IS the opt-in).
 */
export async function sendConfirmationEmail(email: string, token: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const confirmUrl = `${siteUrl}/api/subscribe/confirm?token=${encodeURIComponent(token)}`;

  const innerHtml = `
    <h1 style="font-size:32px;font-weight:800;line-height:1.15;letter-spacing:-0.02em;margin:0 0 16px;color:${BRAND.bgDark};">
      One click to confirm.
    </h1>
    <p style="font-size:17px;line-height:1.6;color:${BRAND.text};margin:0 0 28px;">
      Thanks for subscribing to <strong style="font-weight:700;">Just Get Fit</strong>. Tap the button below to confirm your email and start getting our articles twice a week.
    </p>
    <p style="margin:0 0 32px;">
      <a href="${confirmUrl}" style="display:inline-block;background:${BRAND.neon};color:${BRAND.bgDark};padding:16px 32px;border-radius:100px;font-weight:700;text-decoration:none;font-size:14px;letter-spacing:0.02em;">
        Confirm subscription &rarr;
      </a>
    </p>
    <p style="font-size:13px;line-height:1.6;color:${BRAND.textMuted};margin:0 0 12px;">
      Or paste this link into your browser:
    </p>
    <p style="font-size:12px;line-height:1.5;color:${BRAND.textFaint};margin:0 0 28px;word-break:break-all;">
      ${confirmUrl}
    </p>
    <div style="height:1px;background:${BRAND.line};margin:32px 0;"></div>
    <p style="font-size:13px;color:${BRAND.textMuted};line-height:1.6;margin:0;">
      If you didn't sign up for this, just ignore this email — you won't be subscribed unless you click the button.
    </p>
  `;

  const html = brandedShell({
    preheader: 'One click to confirm your subscription to Just Get Fit.',
    innerHtml,
    showFooterNav: true,
  });

  const text = `JUST GET FIT — Stronger. Every day.

One click to confirm.

Thanks for subscribing to Just Get Fit. Visit this link to confirm your email and start getting our articles twice a week:

${confirmUrl}

If you didn't sign up for this, just ignore this email — you won't be subscribed unless you click the button.

---
Just Get Fit — Stronger. Every day.
${siteUrl}`;

  return sendWithRetry({
    from: fromEmail,
    to: email,
    subject: 'Confirm your subscription to Just Get Fit',
    html,
    text,
  });
}

/**
 * Send a published article to one subscriber.
 * Includes List-Unsubscribe headers (Gmail bulk-sender requirement).
 */
export async function sendNewsletterEmail(opts: {
  email: string;
  unsubscribeToken: string;
  postTitle: string;
  postExcerpt: string;
  postSlug: string;
  postCoverUrl: string | null;
  postCategory: string | null;
  sendId?: string; // attribution tag for open/click tracking webhooks
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const unsubUrl = `${siteUrl}/api/subscribe/unsubscribe?token=${encodeURIComponent(opts.unsubscribeToken)}`;
  const articleUrl = opts.postCategory
    ? `${siteUrl}/articles/${opts.postCategory}/${opts.postSlug}`
    : `${siteUrl}/articles`;

  const cover = opts.postCoverUrl
    ? `<img src="${opts.postCoverUrl}" alt="" style="width:100%;height:auto;display:block;border-radius:12px;margin:0 0 28px;" />`
    : '';

  const category = opts.postCategory
    ? `<div style="margin:0 0 16px;"><span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.bgDark};background:${BRAND.neon};padding:4px 10px;border-radius:4px;">${opts.postCategory.toUpperCase()}</span></div>`
    : '';

  const innerHtml = `
    ${cover}
    ${category}
    <h1 style="font-size:32px;font-weight:800;line-height:1.15;letter-spacing:-0.02em;margin:0 0 16px;color:${BRAND.bgDark};">
      ${escapeHtml(opts.postTitle)}
    </h1>
    <p style="font-size:18px;line-height:1.6;color:${BRAND.textMuted};margin:0 0 32px;">
      ${escapeHtml(opts.postExcerpt)}
    </p>
    <p style="margin:0 0 8px;">
      <a href="${articleUrl}" style="display:inline-block;background:${BRAND.bgDark};color:${BRAND.neon};padding:16px 32px;border-radius:100px;font-weight:700;text-decoration:none;font-size:14px;letter-spacing:0.02em;">
        Read the full article &rarr;
      </a>
    </p>
    <p style="font-size:13px;color:${BRAND.textFaint};margin:24px 0 0;">
      Posted at <a href="${articleUrl}" style="color:${BRAND.textMuted};text-decoration:none;">${articleUrl.replace(/^https?:\/\//, '')}</a>
    </p>
  `;

  const html = brandedShell({
    preheader: opts.postExcerpt.slice(0, 140),
    innerHtml,
    unsubscribeUrl: unsubUrl,
  });

  const text = `JUST GET FIT — Stronger. Every day.

${opts.postCategory ? `[${opts.postCategory.toUpperCase()}]\n\n` : ''}${opts.postTitle}

${opts.postExcerpt}

Read the full article: ${articleUrl}

---
You got this email because you subscribed to Just Get Fit.
Unsubscribe in one click: ${unsubUrl}

Just Get Fit — Stronger. Every day.
${siteUrl}`;

  return sendWithRetry({
    from: fromEmail,
    to: opts.email,
    subject: opts.postTitle,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: opts.sendId ? [{ name: 'send_id', value: opts.sendId }] : undefined,
  });
}

/**
 * Send an arbitrary broadcast email to one subscriber.
 * Body content (Markdown) is rendered into the branded shell.
 * Includes List-Unsubscribe headers.
 */
export async function sendBroadcastEmail(opts: {
  email: string;
  unsubscribeToken: string;
  subject: string;
  bodyMarkdown: string;
  sendId?: string; // attribution tag for open/click tracking webhooks
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const unsubUrl = `${siteUrl}/api/subscribe/unsubscribe?token=${encodeURIComponent(opts.unsubscribeToken)}`;
  const bodyHtml = markdownToHtml(opts.bodyMarkdown);

  const innerHtml = bodyHtml;

  // Use the email subject as the preheader for the inbox preview
  const html = brandedShell({
    preheader: opts.subject,
    innerHtml,
    unsubscribeUrl: unsubUrl,
  });

  // Plain-text version: strip Markdown for cleanliness
  const plainBody = opts.bodyMarkdown
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^### (.+)$/gm, '$1\n')
    .replace(/^## (.+)$/gm, '$1\n')
    .replace(/^> (.+)$/gm, '"$1"');

  const text = `JUST GET FIT — Stronger. Every day.

${plainBody}

---
You got this email because you subscribed to Just Get Fit.
Unsubscribe in one click: ${unsubUrl}

Just Get Fit — Stronger. Every day.
${siteUrl}`;

  return sendWithRetry({
    from: fromEmail,
    to: opts.email,
    subject: opts.subject,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: opts.sendId ? [{ name: 'send_id', value: opts.sendId }] : undefined,
  });
}

/**
 * Send a contact form submission to the site owner.
 * Branded so YOU recognize it instantly when it lands in your inbox.
 */
export async function sendContactNotification(opts: {
  toEmail: string;
  name: string;
  fromEmail: string;
  subject: string;
  message: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const safeMessage = escapeHtml(opts.message);

  const innerHtml = `
    <div style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.bgDark};background:${BRAND.neon};padding:4px 10px;border-radius:4px;margin:0 0 16px;">
      Contact form
    </div>
    <h1 style="font-size:28px;font-weight:800;line-height:1.2;letter-spacing:-0.02em;margin:0 0 24px;color:${BRAND.bgDark};">
      ${escapeHtml(opts.subject || 'New message')}
    </h1>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;">
      <tr>
        <td style="padding:8px 0;font-size:13px;color:${BRAND.textMuted};font-weight:600;letter-spacing:0.05em;text-transform:uppercase;width:80px;">From</td>
        <td style="padding:8px 0;font-size:15px;color:${BRAND.text};">${escapeHtml(opts.name)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:13px;color:${BRAND.textMuted};font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Email</td>
        <td style="padding:8px 0;font-size:15px;color:${BRAND.text};"><a href="mailto:${escapeHtml(opts.fromEmail)}" style="color:${BRAND.bgDark};text-decoration:underline;text-decoration-color:${BRAND.neon};">${escapeHtml(opts.fromEmail)}</a></td>
      </tr>
    </table>
    <div style="height:1px;background:${BRAND.line};margin:0 0 24px;"></div>
    <div style="font-size:13px;color:${BRAND.textMuted};font-weight:600;letter-spacing:0.05em;text-transform:uppercase;margin:0 0 12px;">Message</div>
    <p style="white-space:pre-wrap;font-size:16px;line-height:1.7;color:${BRAND.text};margin:0;">${safeMessage}</p>
    <p style="margin:32px 0 0;">
      <a href="mailto:${escapeHtml(opts.fromEmail)}?subject=Re: ${encodeURIComponent(opts.subject || 'Your message')}" style="display:inline-block;background:${BRAND.bgDark};color:${BRAND.neon};padding:14px 28px;border-radius:100px;font-weight:700;text-decoration:none;font-size:14px;">
        Reply to ${escapeHtml(opts.name)} &rarr;
      </a>
    </p>
  `;

  const html = brandedShell({
    preheader: `Contact form: ${opts.subject || 'new message'} from ${opts.name}`,
    innerHtml,
    showFooterNav: false,
  });

  const text = `JUST GET FIT — Contact form submission

From: ${opts.name} (${opts.fromEmail})
Subject: ${opts.subject || '(none)'}

---

${opts.message}

---
Just Get Fit Admin
${siteUrl}`;

  return sendWithRetry({
    from: fromEmail,
    to: opts.toEmail,
    replyTo: opts.fromEmail,
    subject: `[Contact] ${opts.subject || 'New message'}`,
    html,
    text,
  });
}

/**
 * Send the site owner a notification when a new subscriber CONFIRMS their
 * subscription (clicks the verification link from the confirmation email).
 *
 * Wired into /api/subscribe/confirm. Fires fire-and-forget so the user's
 * confirm-link redirect doesn't wait for Resend's API.
 *
 * Only fires for organic public-form signups. Admin imports and admin manual
 * adds skip the confirmation flow entirely (they're inserted directly as
 * confirmed) so they never hit this code path. Same for re-confirmations of
 * existing-already-confirmed subscribers — handled by the early-return in
 * the confirm route.
 */
export async function sendNewSubscriberNotification(opts: {
  toEmail: string;
  subscriberEmail: string;
  source: string | null;
  totalConfirmed: number;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const innerHtml = `
    <div style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.bgDark};background:${BRAND.neon};padding:4px 10px;border-radius:4px;margin:0 0 16px;">
      New subscriber
    </div>
    <h1 style="font-size:28px;font-weight:800;line-height:1.2;letter-spacing:-0.02em;margin:0 0 24px;color:${BRAND.bgDark};">
      ${escapeHtml(opts.subscriberEmail)} just confirmed.
    </h1>
    <p style="font-size:16px;line-height:1.6;color:${BRAND.text};margin:0 0 24px;">
      You now have <strong>${opts.totalConfirmed.toLocaleString()}</strong> confirmed subscriber${opts.totalConfirmed === 1 ? '' : 's'}.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;">
      <tr>
        <td style="padding:8px 0;font-size:13px;color:${BRAND.textMuted};font-weight:600;letter-spacing:0.05em;text-transform:uppercase;width:80px;">Email</td>
        <td style="padding:8px 0;font-size:15px;color:${BRAND.text};font-family:'SF Mono',Menlo,Consolas,monospace;">${escapeHtml(opts.subscriberEmail)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:13px;color:${BRAND.textMuted};font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Source</td>
        <td style="padding:8px 0;font-size:15px;color:${BRAND.text};">${escapeHtml(opts.source || '(unknown)')}</td>
      </tr>
    </table>
    <p style="margin:32px 0 0;">
      <a href="${siteUrl}/admin/subscribers" style="display:inline-block;background:${BRAND.bgDark};color:${BRAND.neon};padding:14px 28px;border-radius:100px;font-weight:700;text-decoration:none;font-size:14px;">
        View subscribers &rarr;
      </a>
    </p>
  `;

  const html = brandedShell({
    preheader: `${opts.subscriberEmail} just confirmed — total: ${opts.totalConfirmed.toLocaleString()}`,
    innerHtml,
    showFooterNav: false,
  });

  const text = `JUST GET FIT — New subscriber confirmed

${opts.subscriberEmail} just confirmed their subscription.

You now have ${opts.totalConfirmed.toLocaleString()} confirmed subscriber${opts.totalConfirmed === 1 ? '' : 's'}.

Source: ${opts.source || '(unknown)'}

View all subscribers: ${siteUrl}/admin/subscribers
`;

  return sendWithRetry({
    from: fromEmail,
    to: opts.toEmail,
    subject: `[New sub] ${opts.subscriberEmail}`,
    html,
    text,
  });
}
