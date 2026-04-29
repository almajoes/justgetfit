import { MetadataRoute } from 'next';
import { supabase } from '@/lib/supabase';
import { getCategories } from '@/lib/cms';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://justgetfit.org';

export const revalidate = 3600; // refresh sitemap every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages (always present)
  const staticUrls: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/articles`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/categories`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/partners`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/subscribe`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
  ];

  // Article URLs (one per published post)
  const { data: posts } = await supabase
    .from('posts')
    .select('slug, updated_at, published_at')
    .order('published_at', { ascending: false });

  const postUrls: MetadataRoute.Sitemap = (posts || []).map((p) => ({
    url: `${SITE_URL}/articles/${p.slug}`,
    lastModified: new Date(p.updated_at || p.published_at),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  // Category URLs (one per category)
  const categories = await getCategories();
  const categoryUrls: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${SITE_URL}/category/${c.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...staticUrls, ...postUrls, ...categoryUrls];
}
