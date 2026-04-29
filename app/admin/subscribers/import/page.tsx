import { ImportSubscribersClient } from '@/components/admin/ImportSubscribersClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata = { title: 'Import subscribers · Admin' };

export default function ImportSubscribersPage() {
  return <ImportSubscribersClient />;
}
