import type { Metadata } from 'next';
import './globals.css';
import { getSiteSettings, getSiteCode } from '@/lib/cms';

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
  const fullTitle = `${site.name} — ${site.tagline}`;
  const parsedMeta = parseMetaTagsToMetadata(siteCode.meta_tags);

  return {
    title: { default: fullTitle, template: `%s · ${site.name}` },
    description: site.description,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: '/' },
    keywords: ['fitness', 'strength training', 'hypertrophy', 'nutrition', 'recovery', 'mobility', 'evidence-based fitness'],
    authors: [{ name: site.name }],
    openGraph: {
      title: fullTitle,
      description: site.description,
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
      title: fullTitle,
      description: site.description,
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
      </body>
    </html>
  );
}
