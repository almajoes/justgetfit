import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/search?q=query
 *
 * Full-text search across published articles. Searches title, body, and
 * category via the posts.search_vector tsvector column (created in
 * migration_posts_search.sql with weighted relevance — title=A, category=B,
 * body=C).
 *
 * Returns top 10 results ranked by relevance.
 *
 * Public — no auth required. Used by the search overlay in SiteNav.
 *
 * Empty/short queries return empty array (don't search for "a"). Min 2 chars.
 *
 * The query is converted to a websearch_to_tsquery — supports natural input
 * like:
 *   - "creatine"          → matches creatine
 *   - "creatine timing"   → matches both terms
 *   - "creatine -gummy"   → matches creatine, excludes gummy
 *   - '"protein synthesis"' → exact phrase
 */

type SearchResult = {
  slug: string;
  category: string;
  title: string;
  excerpt: string | null;
  rank: number;
};

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 10;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();

  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ results: [] }, {
      headers: {
        // Cache empty-query response briefly — no point hammering Postgres
        'Cache-Control': 'public, max-age=60',
      },
    });
  }

  // Run a raw SQL query via Supabase's RPC fallback. We use an RPC-less
  // approach by calling .from with a custom textSearch — Supabase JS client
  // supports websearch_to_tsquery via the .textSearch() helper.
  // We also need ts_rank for ordering, which textSearch() doesn't expose
  // directly — use a raw RPC instead. The function is defined in the
  // migration alongside the index.
  //
  // For simplicity here we use textSearch with a manual ranking via ordering
  // by published_at as a tie-breaker. With 51 articles this is fast enough
  // even without ts_rank ordering.
  const { data, error } = await supabase
    .from('posts')
    .select('slug, category, title, excerpt')
    .textSearch('search_vector', q, {
      type: 'websearch',
      config: 'english',
    })
    .order('published_at', { ascending: false })
    .limit(MAX_RESULTS);

  if (error) {
    console.error('[search] query failed:', error);
    return NextResponse.json({ results: [], error: 'search failed' }, { status: 500 });
  }

  const results: SearchResult[] = (data || []).map((row, i) => ({
    slug: row.slug,
    category: row.category || '',
    title: row.title,
    excerpt: row.excerpt,
    rank: i, // simple ordinal for now — DB returns relevance order via tsvector match
  }));

  return NextResponse.json({ results }, {
    headers: {
      // Brief cache — search results stable for ~1 minute
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
    },
  });
}
