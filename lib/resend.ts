import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || 'Just Get Fit <hello@justgetfit.org>';
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://justgetfit.org';

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * Send a confirmation email when someone subscribes.
 */
export async function sendConfirmationEmail(email: string, token: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const confirmUrl = `${siteUrl}/api/subscribe/confirm?token=${encodeURIComponent(token)}`;

  try {
    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Confirm your subscription to Just Get Fit',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
          <h1 style="font-size: 24px; margin: 0 0 16px;">Confirm your subscription</h1>
          <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
            Thanks for subscribing to Just Get Fit. Click the button below to confirm your email and start getting our weekly Monday article.
          </p>
          <p style="margin: 32px 0;">
            <a href="${confirmUrl}" style="display: inline-block; background: #c4ff3d; color: #000; padding: 14px 28px; border-radius: 100px; font-weight: 600; text-decoration: none; font-size: 14px;">
              Confirm subscription
            </a>
          </p>
          <p style="font-size: 13px; color: #666; line-height: 1.6;">
            If you didn't sign up for this, just ignore this email — you won't be subscribed unless you click the button.
          </p>
          <p style="font-size: 12px; color: #999; margin-top: 32px; border-top: 1px solid #e5e5e5; padding-top: 16px;">
            Just Get Fit — Stronger. Every day.
          </p>
        </div>
      `,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Send a published article to one subscriber.
 * Each email includes a unique unsubscribe link.
 */
export async function sendNewsletterEmail(opts: {
  email: string;
  unsubscribeToken: string;
  postTitle: string;
  postExcerpt: string;
  postSlug: string;
  postCoverUrl: string | null;
  postCategory: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const unsubUrl = `${siteUrl}/api/subscribe/unsubscribe?token=${encodeURIComponent(opts.unsubscribeToken)}`;
  const articleUrl = `${siteUrl}/articles/${opts.postSlug}`;
  const cover = opts.postCoverUrl
    ? `<img src="${opts.postCoverUrl}" alt="" style="width: 100%; max-width: 560px; height: auto; border-radius: 12px; margin: 0 0 24px;" />`
    : '';
  const category = opts.postCategory
    ? `<div style="font-size: 12px; color: #c4ff3d; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 12px;">${opts.postCategory.toUpperCase()}</div>`
    : '';

  try {
    await resend.emails.send({
      from: fromEmail,
      to: opts.email,
      subject: opts.postTitle,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a; background: #fff;">
          ${cover}
          ${category}
          <h1 style="font-size: 28px; line-height: 1.2; margin: 0 0 16px; color: #0a0a0d;">${opts.postTitle}</h1>
          <p style="font-size: 17px; line-height: 1.6; color: #444; margin: 0 0 28px;">${opts.postExcerpt}</p>
          <p style="margin: 0 0 32px;">
            <a href="${articleUrl}" style="display: inline-block; background: #0a0a0d; color: #c4ff3d; padding: 14px 28px; border-radius: 100px; font-weight: 600; text-decoration: none; font-size: 14px;">
              Read the full article →
            </a>
          </p>
          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;" />
          <p style="font-size: 12px; color: #999; line-height: 1.6;">
            You got this email because you subscribed to Just Get Fit. <br/>
            <a href="${unsubUrl}" style="color: #999;">Unsubscribe in one click</a>
          </p>
          <p style="font-size: 11px; color: #bbb; margin-top: 12px;">
            Just Get Fit — Stronger. Every day.<br/>
            Nothing here is medical advice.
          </p>
        </div>
      `,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Send a contact form notification to the site owner.
 */
export async function sendContactNotification(opts: {
  toEmail: string;
  name: string;
  fromEmail: string;
  subject: string;
  message: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  try {
    await resend.emails.send({
      from: fromEmail,
      to: opts.toEmail,
      replyTo: opts.fromEmail,
      subject: `[Contact] ${opts.subject || 'New message'}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <h2 style="margin: 0 0 16px;">New contact form submission</h2>
          <p><strong>From:</strong> ${opts.name} (${opts.fromEmail})</p>
          <p><strong>Subject:</strong> ${opts.subject || '(none)'}</p>
          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 16px 0;" />
          <p style="white-space: pre-wrap; line-height: 1.6;">${opts.message.replace(/</g, '&lt;')}</p>
        </div>
      `,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Convert a simple Markdown subset to HTML for broadcast emails.
 * Supports: paragraphs, **bold**, *italic*, [text](url), ## h2, ### h3, > blockquote, lists.
 * Keeps it simple — for richer needs, the admin can paste raw HTML in the body.
 */
function markdownToHtml(md: string): string {
  let html = md.trim();

  // Escape HTML special chars first (so user-typed < and > don't break things)
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:18px;font-weight:700;margin:24px 0 12px;color:#0a0a0d;">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:22px;font-weight:700;margin:28px 0 14px;color:#0a0a0d;">$1</h2>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:3px solid #c4ff3d;padding:8px 16px;margin:16px 0;color:#444;font-style:italic;">$1</blockquote>');

  // Bold + italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#0a0a0d;text-decoration:underline;">$1</a>');

  // Unordered lists
  html = html.replace(/(^- .+(?:\n- .+)*)/gm, (match) => {
    const items = match.split('\n').map((l) => `<li style="margin:4px 0;">${l.replace(/^- /, '')}</li>`).join('');
    return `<ul style="margin:16px 0;padding-left:24px;">${items}</ul>`;
  });

  // Paragraphs (split on blank lines, wrap non-block content)
  const blocks = html.split(/\n\s*\n/);
  html = blocks.map((b) => {
    const trimmed = b.trim();
    if (!trimmed) return '';
    // Already a block element? Don't wrap.
    if (/^<(h[1-6]|ul|ol|blockquote|p|div)/.test(trimmed)) return trimmed;
    return `<p style="margin:0 0 16px;line-height:1.65;color:#1a1a1a;">${trimmed.replace(/\n/g, '<br/>')}</p>`;
  }).join('\n');

  return html;
}

/**
 * Send an arbitrary broadcast email (announcement, off-cycle message, etc.) to one subscriber.
 * Each email gets the subscriber's unique unsubscribe link.
 *
 * Used by /api/admin/broadcast for ad-hoc blasts to the full list, and by
 * /api/admin/broadcast/test for previewing before send.
 */
export async function sendBroadcastEmail(opts: {
  email: string;
  unsubscribeToken: string;
  subject: string;
  bodyMarkdown: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const unsubUrl = `${siteUrl}/api/subscribe/unsubscribe?token=${encodeURIComponent(opts.unsubscribeToken)}`;
  const bodyHtml = markdownToHtml(opts.bodyMarkdown);

  try {
    await resend.emails.send({
      from: fromEmail,
      to: opts.email,
      subject: opts.subject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a; background: #fff;">
          ${bodyHtml}
          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;" />
          <p style="font-size: 12px; color: #999; line-height: 1.6;">
            You got this email because you subscribed to Just Get Fit. <br/>
            <a href="${unsubUrl}" style="color: #999;">Unsubscribe in one click</a>
          </p>
          <p style="font-size: 11px; color: #bbb; margin-top: 12px;">
            Just Get Fit — Stronger. Every day.<br/>
            Nothing here is medical advice.
          </p>
        </div>
      `,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
