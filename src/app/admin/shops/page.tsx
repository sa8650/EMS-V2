import { Store } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { enterShopAction } from '../actions';
import { setShopActiveAction } from '../_actions/shops';
import { PageHeader } from '@/components/console/bento';
import { ConfirmAction } from '@/components/console/confirm-action';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, DataTable, EmptyState, tableStyles } from '@/components/ui/display';
import { formatDate } from '@/lib/format';
import { requireAdmin } from '@/server/auth/guards';
import { currentEntitlement } from '@/server/licensing';
import { adminShops } from '@/server/services/shops';
import { DeleteShopDialog, ShopDialog } from './forms';

export const metadata: Metadata = { title: 'Shops' };

export default async function AdminShopsPage() {
  const { db, admin } = await requireAdmin();
  const [shops, ent] = await Promise.all([adminShops(db, admin.id), currentEntitlement(db, admin.id)]);
  const limit = ent?.maxShops ?? 0;
  let used = 0;
  const rows = shops.map((s) => ({ ...s, within: s.active && ++used <= limit }));
  const activeCount = shops.filter((s) => s.active).length;
  return (
    <>
      <PageHeader
        title="Shops"
        description={ent ? `${activeCount} of ${limit} active shop${limit === 1 ? '' : 's'} in use. Deactivate a shop to free its place in the licence.` : 'Activate a licence to create shops.'}
        actions={ent && activeCount < limit ? <ShopDialog /> : null}
      />
      {!ent && <Alert tone="warning">You need an active licence before you can create shops. <Link href="/admin/licenses">Choose a plan</Link>.</Alert>}
      <Card bodyless>
        <DataTable
          caption="Shops"
          rows={rows}
          rowKey={(s) => s.id}
          empty={<EmptyState icon={Store} title="No shops yet" />}
          columns={[
            { key: 'name', header: 'Shop', cell: (s) => <><strong>{s.name}</strong><div className={tableStyles.muted}>{s.category}</div></> },
            { key: 'code', header: 'Shop ID', cell: (s) => <span className={tableStyles.mono}>{s.shop_code}</span> },
            { key: 'created', header: 'Created', cell: (s) => formatDate(s.created_at) },
            { key: 'status', header: 'Status', cell: (s) => (!s.active ? <Badge tone="danger">Deactivated</Badge> : s.within ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Read-only</Badge>) },
            {
              key: 'actions',
              header: <span className="visually-hidden">Actions</span>,
              cell: (s) => (
                <span style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <form action={enterShopAction}>
                    <input type="hidden" name="shopId" value={s.id} />
                    <Button type="submit" size="small">Open</Button>
                  </form>
                  <ShopDialog shop={s} />
                  <ConfirmAction
                    label={s.active ? 'Deactivate' : 'Activate'}
                    title={s.active ? 'Deactivate shop?' : 'Activate shop?'}
                    message={s.active ? <>Staff of <strong>{s.name}</strong> will not be able to sign in, and the shop stops using your licence. Its records are kept.</> : <>Make <strong>{s.name}</strong> active again? It uses a place in your licence.</>}
                    confirmLabel={s.active ? 'Deactivate' : 'Activate'}
                    danger={s.active}
                    action={setShopActiveAction}
                    fields={{ id: s.id, active: String(!s.active) }}
                  />
                  <DeleteShopDialog shop={s} />
                </span>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
