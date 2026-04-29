import { getSiteSettings, getFooterSettings } from '@/lib/cms';
import { SettingsClient } from '@/components/admin/SettingsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata = { title: 'Site Settings · Admin' };

export default async function AdminSettingsPage() {
  const [site, footer] = await Promise.all([getSiteSettings(), getFooterSettings()]);
  return <SettingsClient site={site} footer={footer} />;
}
