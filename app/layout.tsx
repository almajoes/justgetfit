import type { Metadata } from 'next';
import './globals.css';
import { getSiteSettings } from '@/lib/cms';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://justgetfit.org';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteSettings();
  const fullTitle = `${site.name} — ${site.tagline}`;
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
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await getSiteSettings();

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
      <body>{children}</body>
    </html>
  );
}
