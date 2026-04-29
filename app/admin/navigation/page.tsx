import { supabaseAdmin } from '@/lib/supabase-admin';
import { NavigationClient } from '@/components/admin/NavigationClient';
import type { NavItem } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Navigation · Admin' };

export default async function NavigationAdminPage() {
  const { data } = await supabaseAdmin
    .from('nav_items')
    .select('*')
    .order('location')
    .order('sort_order');
  const items = (data as NavItem[]) || [];

  return <NavigationClient initialItems={items} />;
}
