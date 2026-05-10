import { supabaseAdmin } from '@/lib/supabase-admin';
import { AuthorsClient } from '@/components/admin/AuthorsClient';
import type { Author } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata = { title: 'Authors · Admin' };

export default async function AuthorsAdminPage() {
  const [{ data: authorsData }, { data: rotationRow }] = await Promise.all([
    supabaseAdmin
      .from('authors')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true }),
    supabaseAdmin.from('settings').select('value').eq('key', 'author_rotation_index').maybeSingle(),
  ]);

  const authors = (authorsData as Author[]) || [];
  // Rotation pointer: surfaced on the admin so the user can see how the
  // round-robin is progressing. Just informational — the picker reads
  // this and bumps it on every draft generation.
  const rotationNext = (() => {
    const raw = rotationRow?.value;
    if (!raw || typeof raw !== 'object') return 0;
    const next = (raw as { next?: unknown }).next;
    return typeof next === 'number' && next >= 0 ? Math.floor(next) : 0;
  })();

  return <AuthorsClient initialAuthors={authors} rotationNext={rotationNext} />;
}
