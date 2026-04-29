import 'server-only';

const UNSPLASH_API = 'https://api.unsplash.com';

export type UnsplashPhoto = {
  url: string;
  credit: string;
  alt: string;
};

/**
 * Search Unsplash for a relevant photo using keywords.
 * Returns null if the API key isn't set or the search fails — the cron will still
 * succeed and the post will just have no cover photo (you can add one in admin).
 */
export async function searchUnsplash(keywords: string): Promise<UnsplashPhoto | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return null;

  try {
    const url = `${UNSPLASH_API}/search/photos?query=${encodeURIComponent(keywords)}&per_page=10&orientation=landscape&content_filter=high`;
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      console.error('Unsplash search failed:', res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as {
      results: Array<{
        urls: { regular: string; full: string };
        alt_description: string | null;
        user: { name: string; links: { html: string } };
        links: { html: string };
      }>;
    };

    if (!data.results || data.results.length === 0) return null;

    // Pick a random one from the top 5 to add variety
    const top = data.results.slice(0, 5);
    const pick = top[Math.floor(Math.random() * top.length)];

    return {
      url: pick.urls.regular,
      credit: `Photo by ${pick.user.name} on Unsplash`,
      alt: pick.alt_description ?? '',
    };
  } catch (err) {
    console.error('Unsplash search error:', err);
    return null;
  }
}

/**
 * Manual photo search for admin UI - returns multiple options to pick from.
 */
export async function listUnsplashOptions(keywords: string): Promise<UnsplashPhoto[]> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return [];

  try {
    const url = `${UNSPLASH_API}/search/photos?query=${encodeURIComponent(keywords)}&per_page=12&orientation=landscape&content_filter=high`;
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      results: Array<{
        urls: { regular: string };
        alt_description: string | null;
        user: { name: string };
      }>;
    };

    return data.results.map((p) => ({
      url: p.urls.regular,
      credit: `Photo by ${p.user.name} on Unsplash`,
      alt: p.alt_description ?? '',
    }));
  } catch {
    return [];
  }
}
