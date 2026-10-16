import { List } from 'lucide-react';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/console/bento';
import { Badge, Card, DataTable, EmptyState } from '@/components/ui/display';
import { ADDON_INFO, ADDON_KEYS } from '@/config/modules';
import { formatMoney } from '@/lib/format';
import { requireOwner } from '@/server/auth/guards';
import { readModules } from '@/server/licensing';
import { listPlans } from '@/server/services/licences';
import { PlanDialog } from './forms';

export const metadata: Metadata = { title: 'Licence plans' };

export default async function PlansPage() {
  const { db } = await requireOwner();
  const plans = (await listPlans(db)).map((p) => ({ ...p, price: Number(p.price), modules: readModules(p.modules) }));
  return (
    <>
      <PageHeader title="Licence plans" description="Plans administrators can request. Active plans also appear on the public pricing page." actions={<PlanDialog />} />
      <Card bodyless>
        <DataTable
          caption="Licence plans"
          rows={plans}
          rowKey={(p) => p.id}
          empty={<EmptyState icon={List} title="No plans yet">Create a plan so administrators can request a licence.</EmptyState>}
          columns={[
            { key: 'title', header: 'Plan', cell: (p) => <><strong>{p.title}</strong> {!p.active && <Badge>Hidden</Badge>}</> },
            { key: 'price', header: 'Price', numeric: true, cell: (p) => formatMoney(p.price) },
            { key: 'duration', header: 'Duration', cell: (p) => `${p.duration_months} month${p.duration_months === 1 ? '' : 's'}` },
            { key: 'shops', header: 'Shops', numeric: true, cell: (p) => p.max_shops },
            { key: 'modules', header: 'Add-ons', cell: (p) => ADDON_KEYS.filter((k) => p.modules[k]).map((k) => ADDON_INFO[k].name).join(', ') || '—' },
            { key: 'actions', header: <span className="visually-hidden">Actions</span>, cell: (p) => <PlanDialog plan={p} /> },
          ]}
        />
      </Card>
    </>
  );
}
