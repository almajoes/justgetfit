import { MetadataRoute } from 'next';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCategories } from '@/lib/cms';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://justgetfit.org';

export const revalidate = 3600; // refresh sitemap every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages (always present)
  const staticUrls: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/articles`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/categories`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/authors`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/app`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/partners`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/subscribe`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    // Legal pages — low priority but should still be discoverable.
    { url: `${SITE_URL}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.2 },
  ];

  // Article URLs (one per published post)
  const { data: posts } = await supabase
    .from('posts')
    .select('slug, category, updated_at, published_at')
    .order('published_at', { ascending: false });

  const postUrls: MetadataRoute.Sitemap = (posts || [])
    .filter((p) => p.category) // skip posts without a category — would produce broken URL
    .map((p) => ({
      url: `${SITE_URL}/articles/${p.category}/${p.slug}`,
      lastModified: new Date(p.updated_at || p.published_at),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));

  // Category URLs (one per category)
  const categories = await getCategories();
  const categoryUrls: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${SITE_URL}/articles/${c.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  // Author detail URLs (one per active author). Inactive authors are
  // intentionally excluded from the sitemap to match how /authors hides
  // them from the public index. Their pages still resolve directly so
  // historical bylines work, just not surfaced for discovery.
  const { data: authors } = await supabaseAdmin
    .from('authors')
    .select('slug, created_at')
    .eq('is_active', true);

  const authorUrls: MetadataRoute.Sitemap = (authors || []).map((a) => ({
    url: `${SITE_URL}/authors/${a.slug}`,
    lastModified: new Date(a.created_at),
    changeFrequency: 'weekly' as const,
    priority: 0.5,
  }));

  return [...staticUrls, ...postUrls, ...categoryUrls, ...authorUrls];
}
