import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PageEditor } from '@/components/admin/PageEditor';

// Force fresh data on every request - never cache
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const ALLOWED = ['home-hero', 'about', 'subscribe', 'contact'] as const;

export default async function AdminPageEditor({ params }: { params: { slug: string } }) {
  if (!ALLOWED.includes(params.slug as (typeof ALLOWED)[number])) notFound();

  const { data } = await supabaseAdmin
    .from('pages')
    .select('content')
    .eq('slug', params.slug)
    .maybeSingle();

  if (!data) notFound();

  return <PageEditor slug={params.slug} initialContent={data.content} />;
}
