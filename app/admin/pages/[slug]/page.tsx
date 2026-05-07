import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PageEditor } from '@/components/admin/PageEditor';
import {
  HOME_HERO_DEFAULT,
  ABOUT_DEFAULT,
  SUBSCRIBE_DEFAULT,
  CONTACT_DEFAULT,
  APP_DEFAULT,
  deepMerge,
} from '@/lib/cms';

// Force fresh data on every request - never cache
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const ALLOWED = ['home-hero', 'about', 'subscribe', 'contact', 'app'] as const;

// When a pages row doesn't exist yet, fall back to the same defaults the
// public site uses. The editor renders the default values so admins start
// from a populated baseline. First save creates the row via the API
// route's upsert.
const DEFAULTS: Record<typeof ALLOWED[number], unknown> = {
  'home-hero': HOME_HERO_DEFAULT,
  about: ABOUT_DEFAULT,
  subscribe: SUBSCRIBE_DEFAULT,
  contact: CONTACT_DEFAULT,
  app: APP_DEFAULT,
};

export default async function AdminPageEditor({ params }: { params: { slug: string } }) {
  if (!ALLOWED.includes(params.slug as (typeof ALLOWED)[number])) notFound();

  const { data } = await supabaseAdmin
    .from('pages')
    .select('content')
    .eq('slug', params.slug)
    .maybeSingle();

  // Deep-merge stored content over defaults. This matches the public site's
  // getPage() behavior — fields that exist in defaults but NOT in the stored
  // row (e.g. new fields added in later migrations) get populated from
  // defaults so admins see a fully-populated editor instead of empty fields
  // for new schema additions. Stored values always win for fields that exist.
  const fallback = DEFAULTS[params.slug as typeof ALLOWED[number]];
  const initialContent = data?.content
    ? deepMerge(fallback, data.content)
    : fallback;

  return <PageEditor slug={params.slug} initialContent={initialContent as Record<string, any>} />;
}
