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
 * Race-safety:
 *   The standard cron firing at 13:00 UTC twice a week is single-threaded
 *   (Vercel Cron). Manual generation via /admin/generate could in theory
 *   collide with cron if an admin clicks "Generate" at exactly 13:00 on
 *   a Mon/Fri — but the worst-case outcome is two consecutive drafts get
 *   assigned to the same author. Acceptable.
 *
 * Returns:
 *   The picked Author row, or `null` if there are no active authors at
 *   all (caller should fall back to an unbylined draft in that case —
 *   should never happen in practice once the migration is run).
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
