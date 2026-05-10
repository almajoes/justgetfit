/**
 * Round-robin author picker for new draft creation.
 *
 * Reads the rotation pointer from `settings.author_rotation_index`,
 * fetches active authors ordered by (sort_order, id), picks
 * `authors[next % len]`, then writes back `next + 1`. The %-len wrap
 * happens on the next read, not on write — keeps the counter
 * monotonically increasing which makes audit trails sane (you can read
 * the value to know how many drafts have been generated since rotation
 * started, modulo legacy seeds).
 *
 * NOTE (May 9 2026): pickNextAuthor() is currently NOT wired into any
 * draft-creation path. The cron has been removed and batch-generate no
 * longer auto-assigns authors — admins pick author by topic fit in the
 * DraftEditor before publish. The helper is retained for future use (a
 * potential "auto-rotate" toggle, or scripted backfill jobs).
 *
 * Race-safety (when the helper is wired back in):
 *   Manual generation is single-threaded per request. If two admins
 *   click "Generate" at the same moment they could collide on the
 *   rotation pointer — worst case both drafts get assigned the same
 *   author. Acceptable.
 *
 * Returns:
 *   The picked Author row, or `null` if there are no active authors at
 *   all.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Author } from '@/lib/supabase';

const ROTATION_KEY = 'author_rotation_index';

export async function pickNextAuthor(): Promise<Author | null> {
  // Fetch active authors in stable order. We use sort_order primarily so
  // the admin can reorder via /admin/authors; id is the tie-breaker.
  const { data: authors, error: authorErr } = await supabaseAdmin
    .from('authors')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (authorErr) {
    console.error('[pickNextAuthor] author lookup failed:', authorErr.message);
    return null;
  }
  if (!authors || authors.length === 0) {
    console.warn('[pickNextAuthor] no active authors — skipping byline assignment');
    return null;
  }

  // Read current pointer. Default to 0 if the settings row is missing
  // (should be created by the migration but we don't crash if it isn't).
  const { data: settingRow } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', ROTATION_KEY)
    .maybeSingle();

  const current = (() => {
    const raw = settingRow?.value;
    if (!raw || typeof raw !== 'object') return 0;
    const next = (raw as { next?: unknown }).next;
    if (typeof next !== 'number' || !Number.isFinite(next) || next < 0) return 0;
    return Math.floor(next);
  })();

  const picked = authors[current % authors.length] as Author;

  // Bump the pointer. Upsert so a missing row gets created (the migration
  // creates one, but we want to be defensive).
  const { error: bumpErr } = await supabaseAdmin
    .from('settings')
    .upsert({ key: ROTATION_KEY, value: { next: current + 1 } }, { onConflict: 'key' });
  if (bumpErr) {
    // Non-fatal — we still picked an author, just didn't advance the
    // rotation. Next call will re-pick the same author. Log and move on.
    console.error('[pickNextAuthor] failed to bump rotation pointer:', bumpErr.message);
  }

  return picked;
}

/**
 * Read all active authors. Used by the admin UI and any rendering
 * surface that needs the full list. Sorted the same as the picker.
 */
export async function listActiveAuthors(): Promise<Author[]> {
  const { data, error } = await supabaseAdmin
    .from('authors')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (error) {
    console.error('[listActiveAuthors] failed:', error.message);
    return [];
  }
  return (data ?? []) as Author[];
}

/**
 * Read all authors (active + inactive) for the admin panel.
 */
export async function listAllAuthors(): Promise<Author[]> {
  const { data, error } = await supabaseAdmin
    .from('authors')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (error) {
    console.error('[listAllAuthors] failed:', error.message);
    return [];
  }
  return (data ?? []) as Author[];
}

/**
 * Look up a single author by id, public-readable (uses anon client).
 * Used by the article page to render the byline. Returns null when not
 * found so the caller can fall back gracefully.
 */
export async function getAuthorById(
  id: string | null | undefined
): Promise<Author | null> {
  if (!id) return null;
  const { data } = await supabaseAdmin
    .from('authors')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return (data as Author | null) ?? null;
}

/**
 * Look up a single author by slug. Reserved for the future
 * /articles/by/<slug> author archive page.
 */
export async function getAuthorBySlug(slug: string): Promise<Author | null> {
  const { data } = await supabaseAdmin
    .from('authors')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  return (data as Author | null) ?? null;
}
