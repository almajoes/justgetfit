import { supabaseAdmin } from '@/lib/supabase-admin';
import { SiteCodeEditor } from '@/components/admin/SiteCodeEditor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata = { title: 'Site code · Admin' };

const DEFAULT = {
  meta_tags: '',
  head_scripts: '',
  body_scripts: '',
};

export default async function SiteCodeAdminPage() {
  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'site_code')
    .maybeSingle();

  const initial = (data?.value as typeof DEFAULT) || DEFAULT;

  return <SiteCodeEditor initial={initial} />;
}
