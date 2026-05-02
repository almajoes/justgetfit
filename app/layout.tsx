import type { Metadata } from 'next';
import './globals.css';
import { getSiteSettings, getSiteCode } from '@/lib/cms';
import { AnalyticsBeacon } from '@/components/AnalyticsBeacon';
import { CookieBanner } from '@/components/CookieBanner';
import { Suspense } from 'react';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://justgetfit.org';

/**
 * Parse a string of <meta name="..." content="..." /> tags into a structured
 * object that Next.js's metadata API can consume. Specifically extracts:
 *   - google-site-verification → metadata.verification.google
 *   - msvalidate.01           → metadata.verification.other['msvalidate.01']
 *   - any other <meta name="..." content="..." /> → metadata.other[name] = content
 *
 * This guarantees the tags end up in <head> SSR'd as proper <meta> elements
 * (not wrapped in <div>), which is required for Google Search Console
 * verification and other crawler-based verifications.
 */
function parseMetaTagsToMetadata(html: string): Pick<Metadata, 'verification' | 'other'> {
  const result: { verification: Metadata['verification']; other: Record<string, string> } = {
    verification: {},
    other: {},
  };
  if (!html.trim()) return result;

  // Match <meta name="..." content="..." /> in any quote/order combination
  const metaRegex = /<meta\s+[^>]*?name\s*=\s*["']([^"']+)["'][^>]*?content\s*=\s*["']([^"']+)["'][^>]*?\/?>/gi;
  // Also match content-first variant
  const metaRegexAlt = /<meta\s+[^>]*?content\s*=\s*["']([^"']+)["'][^>]*?name\s*=\s*["']([^"']+)["'][^>]*?\/?>/gi;

  const seen = new Set<string>();
  const collect = (name: string, content: string) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (key === 'google-site-verification') {
      result.verification = { ...result.verification, google: content };
    } else if (key === 'yandex-verification') {
      result.verification = { ...result.verification, yandex: content };
    } else if (key === 'me') {
      result.verification = { ...result.verification, me: content };
    } else {
      // Includes msvalidate.01 (Bing), facebook-domain-verification, etc.
      result.other[name] = content;
    }
  };

  let m: RegExpExecArray | null;
  while ((m = metaRegex.exec(html)) !== null) collect(m[1], m[2]);
  while ((m = metaRegexAlt.exec(html)) !== null) collect(m[2], m[1]);

  return result;
}

export async function generateMetadata(): Promise<Metadata> {
  const [site, siteCode] = await Promise.all([getSiteSettings(), getSiteCode()]);
  const parsedMeta = parseMetaTagsToMetadata(siteCode.meta_tags);

  // Compute the values we'll actually use, with cascading fallbacks:
  // CMS-set value (if non-empty) → computed default → bare default
  const computedTitle = `${site.name} — ${site.tagline}`;
  const homeTitle = site.seo_title?.trim() || computedTitle;
  const description = site.seo_description?.trim() || site.description;
  const ogTitle = site.og_title?.trim() || homeTitle;
  const ogDescription = site.og_description?.trim() || description;

  // Keywords: CMS comma-separated string overrides the hardcoded defaults.
  // Empty CMS value = use built-in defaults.
  const defaultKeywords = ['fitness', 'strength training', 'hypertrophy', 'nutrition', 'recovery', 'mobility', 'evidence-based fitness'];
  const keywords = site.keywords?.trim()
    ? site.keywords.split(',').map((k) => k.trim()).filter(Boolean)
    : defaultKeywords;

  // Sub-page title template. Uses %s as the placeholder for the page-specific title.
  // Default suffix follows the format: "<page> | Just Get Fit: <description>"
  // Empty admin value falls back to a sensible computed default that includes the brand + a short pitch.
  const defaultTemplate = `%s | ${site.name}: Practical Fitness, Smarter Training & Real Results`;
  const titleTemplate = site.seo_title_template?.trim() || defaultTemplate;

  return {
    title: { default: homeTitle, template: titleTemplate },
    description,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: '/' },
    keywords,
    authors: [{ name: site.name }],
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: SITE_URL,
      siteName: site.name,
      type: 'website',
      locale: 'en_US',
      images: [
        {
          url: `${SITE_URL}/og-image.png`,
          width: 1200,
          height: 630,
          alt: `${site.name} — ${site.tagline}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: ogDescription,
      images: [`${SITE_URL}/og-image.png`],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    // CMS-injected verification + other meta tags — these end up SSR'd in <head>
    verification: parsedMeta.verification,
    other: parsedMeta.other,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [site, siteCode] = await Promise.all([getSiteSettings(), getSiteCode()]);

  // JSON-LD: Organization schema for the site itself
  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    url: SITE_URL,
    logo: `${SITE_URL}/og-image.png`,
    description: site.description,
    slogan: site.tagline,
  };

  // JSON-LD: WebSite with search action (helps Google know your site supports search)
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: SITE_URL,
    description: site.description,
  };

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body>
        {/* Custom meta tags + head scripts from CMS.
            Note: rendered into <body> (not <head>) because React requires a
            wrapper element for dangerouslySetInnerHTML, and a <div> in <head>
            is invalid HTML. For meta tags that MUST be in <head> for crawlers
            (like Google site verification), use the metadata.verification
            API in this file's generateMetadata() function instead. Most analytics
            scripts work fine from <body>. */}
        {(siteCode.meta_tags || siteCode.head_scripts) && (
          <div
            style={{ display: 'none' }}
            dangerouslySetInnerHTML={{
              __html: (siteCode.meta_tags || '') + '\n' + (siteCode.head_scripts || ''),
            }}
            suppressHydrationWarning
          />
        )}
        {children}
        {/* Custom body scripts from CMS — chat widgets, late-loading trackers */}
        {siteCode.body_scripts && (
          <div
            style={{ display: 'none' }}
            dangerouslySetInnerHTML={{ __html: siteCode.body_scripts }}
            suppressHydrationWarning
          />
        )}

        {/* Analytics beacon — fires a pageview on every navigation. Wrapped in
            Suspense because useSearchParams() suspends during static generation
            of any page that doesn't itself opt into dynamic rendering. */}
        <Suspense fallback={null}>
          <AnalyticsBeacon />
        </Suspense>

        {/* Cookie consent banner — shows only on first visit until a choice
            is made. Doesn't block tracking either way; just toggles between
            cookie-based and fingerprint-based visitor identification. */}
        <CookieBanner />
      </body>
    </html>
  );
}
