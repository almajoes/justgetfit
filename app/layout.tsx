import type { Metadata } from 'next';
import './globals.css';
import { getSiteSettings } from '@/lib/cms';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteSettings();
  return {
    title: { default: `${site.name} — ${site.tagline}`, template: `%s · ${site.name}` },
    description: site.description,
    metadataBase: new URL('https://justgetfit.com'),
    openGraph: {
      title: `${site.name} — ${site.tagline}`,
      description: site.description,
      url: 'https://justgetfit.com',
      siteName: site.name,
      type: 'website',
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
