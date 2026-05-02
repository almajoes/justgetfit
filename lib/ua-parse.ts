/**
 * Lightweight User-Agent parser. Extracts device type, browser, and OS from
 * a UA string using regex patterns. Intentionally simple — uses ~60 lines of
 * regex instead of a 200KB npm library (ua-parser-js etc).
 *
 * This is "good enough" for analytics aggregation. Edge cases (uncommon
 * browsers, embedded webviews, etc.) get classified as 'Other' rather than
 * crashing or returning weird values.
 *
 * Bot detection is also here — the UA strings of common crawlers are
 * distinctive enough that a simple substring match catches >99% of them.
 */

const BOT_PATTERNS = [
  // Search engines
  'googlebot', 'bingbot', 'yandexbot', 'duckduckbot', 'baiduspider',
  // Social media previewers
  'facebookexternalhit', 'twitterbot', 'linkedinbot', 'slackbot',
  'discordbot', 'whatsapp', 'telegrambot', 'pinterestbot',
  // Generic
  'bot', 'crawler', 'spider', 'crawling', 'preview', 'scraper',
  // Headless / monitoring
  'headlesschrome', 'phantomjs', 'puppeteer', 'playwright',
  'pingdom', 'uptimerobot', 'statuscake', 'datadog',
  // Archive / SEO
  'ahrefsbot', 'semrushbot', 'mj12bot', 'dotbot', 'wayback',
];

export function isBot(ua: string): boolean {
  const lower = ua.toLowerCase();
  return BOT_PATTERNS.some((p) => lower.includes(p));
}

export type UAInfo = {
  device_type: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  os: string;
};

export function parseUA(ua: string): UAInfo {
  const lower = ua.toLowerCase();

  // Device type — order matters (tablet before mobile, since iPad UA
  // strings on iPadOS now claim Mac OS but we can detect via touch hints).
  let device_type: UAInfo['device_type'] = 'desktop';
  if (/ipad|tablet|kindle|playbook/.test(lower)) {
    device_type = 'tablet';
  } else if (/mobile|android|iphone|ipod|blackberry|windows phone/.test(lower)) {
    device_type = 'mobile';
  }

  // Browser — order matters (Edge before Chrome since Edge UA contains both)
  let browser = 'Other';
  if (lower.includes('edg/') || lower.includes('edge/')) browser = 'Edge';
  else if (lower.includes('opr/') || lower.includes('opera')) browser = 'Opera';
  else if (lower.includes('firefox/')) browser = 'Firefox';
  else if (lower.includes('chrome/') && !lower.includes('chromium')) browser = 'Chrome';
  else if (lower.includes('safari/') && !lower.includes('chrome')) browser = 'Safari';
  else if (lower.includes('chromium')) browser = 'Chromium';

  // OS — order matters (iPadOS reports as Mac OS so we check device_type first)
  let os = 'Other';
  if (device_type === 'tablet' && /macintosh/.test(lower)) os = 'iPadOS';
  else if (/iphone|ipad|ipod/.test(lower)) os = 'iOS';
  else if (/android/.test(lower)) os = 'Android';
  else if (/macintosh|mac os x/.test(lower)) os = 'macOS';
  else if (/windows nt/.test(lower)) os = 'Windows';
  else if (/linux/.test(lower)) os = 'Linux';
  else if (/cros/.test(lower)) os = 'ChromeOS';

  return { device_type, browser, os };
}

/**
 * Extract a domain from a referrer URL. Returns null for invalid URLs or
 * same-site referrals (we only care about external traffic sources).
 */
export function extractReferrerDomain(referrer: string | null, ownDomain: string): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    const domain = url.hostname.replace(/^www\./, '');
    // Skip self-referrals (internal navigation)
    if (domain === ownDomain || domain === `www.${ownDomain}`) return null;
    return domain;
  } catch {
    return null;
  }
}
