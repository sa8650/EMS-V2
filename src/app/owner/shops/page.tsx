import { Store } from 'lucide-react';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/console/bento';
import { Toolbar } from '@/components/console/toolbar';
import { Badge, Card, DataTable, EmptyState, tableStyles } from '@/components/ui/display';
import { formatDate } from '@/lib/format';
import { requireOwner } from '@/server/auth/guards';
import { listAllShops } from '@/server/services/platform';

export const metadata: Metadata = { title: 'Shops' };

export default async function OwnerShopsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { db } = await requireOwner();
  const shops = await listAllShops(db, q);
  return (
    <>
      <PageHeader title="Shops" description="Every shop on the platform. Shops are managed by their administrators." />
      <Card bodyless>
        <Toolbar q={q} placeholder="Search name, Shop ID or category" />
        <DataTable
          caption="Shops"
          rows={shops}
          rowKey={(s) => s.id}
          empty={<EmptyState icon={Store} title={q ? 'No matches' : 'No shops yet'} />}
          columns={[
            { key: 'name', header: 'Shop', cell: (s) => <><strong>{s.name}</strong><div className={tableStyles.muted}>{s.category}</div></> },
            { key: 'code', header: 'Shop ID', cell: (s) => <span className={tableStyles.mono}>{s.shop_code}</span> },
            { key: 'admin', header: 'Administrator', cell: (s) => (s.admins ? <>{s.admins.name}<div className={tableStyles.muted}>{s.admins.email}</div></> : '—') },
            { key: 'created', header: 'Created', cell: (s) => formatDate(s.created_at) },
            { key: 'status', header: 'Status', cell: (s) => <Badge tone={s.active ? 'success' : 'danger'}>{s.active ? 'Active' : 'Deactivated'}</Badge> },
          ]}
        />
      </Card>
    </>
  );
}
