import { Users } from 'lucide-react';
import type { Metadata } from 'next';
import { setAdminActiveAction } from '../_actions/platform';
import { PageHeader } from '@/components/console/bento';
import { ConfirmAction } from '@/components/console/confirm-action';
import { Toolbar } from '@/components/console/toolbar';
import { Badge, Card, DataTable, EmptyState, tableStyles } from '@/components/ui/display';
import { formatDate } from '@/lib/format';
import { requireOwner } from '@/server/auth/guards';
import { listAdmins } from '@/server/services/platform';

export const metadata: Metadata = { title: 'Administrators' };

export default async function AdministratorsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { db } = await requireOwner();
  const admins = await listAdmins(db, q);
  return (
    <>
      <PageHeader title="Administrators" description="Business owners using the platform. Deactivating one blocks them and their shops at once." />
      <Card bodyless>
        <Toolbar q={q} placeholder="Search name, email, phone or code" />
        <DataTable
          caption="Administrators"
          rows={admins}
          rowKey={(a) => a.id}
          empty={<EmptyState icon={Users} title={q ? 'No matches' : 'No administrators yet'} />}
          columns={[
            { key: 'name', header: 'Name', cell: (a) => <><strong>{a.name}</strong><div className={tableStyles.muted}>{a.email}</div></> },
            { key: 'code', header: 'Code', cell: (a) => <span className={tableStyles.mono}>{a.admin_code}</span> },
            { key: 'phone', header: 'Phone', cell: (a) => a.phone },
            { key: 'shops', header: 'Shops', numeric: true, cell: (a) => a.shops },
            { key: 'since', header: 'Joined', cell: (a) => formatDate(a.created_at) },
            { key: 'status', header: 'Status', cell: (a) => <Badge tone={a.active ? 'success' : 'danger'}>{a.active ? 'Active' : 'Inactive'}</Badge> },
            {
              key: 'actions',
              header: <span className="visually-hidden">Actions</span>,
              cell: (a) => <ConfirmAction label={a.active ? 'Deactivate' : 'Activate'} title={a.active ? 'Deactivate administrator?' : 'Activate administrator?'} message={<>{a.active ? 'Block' : 'Restore'} access for <strong>{a.name}</strong> and the staff of their shops.</>} confirmLabel={a.active ? 'Deactivate' : 'Activate'} danger={a.active} action={setAdminActiveAction} fields={{ id: a.id, active: String(!a.active) }} />,
            },
          ]}
        />
      </Card>
    </>
  );
}
