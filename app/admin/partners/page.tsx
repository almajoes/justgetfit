import { supabaseAdmin } from '@/lib/supabase-admin';
import { PartnersClient } from '@/components/admin/PartnersClient';
import type { Partner } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Partners · Admin' };

export default async function PartnersAdminPage() {
  const { data } = await supabaseAdmin.from('partners').select('*').order('position', { ascending: true });
  const partners = (data as Partner[]) || [];
  return <PartnersClient initialPartners={partners} />;
}
