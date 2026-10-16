import { Activity } from 'lucide-react';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/console/bento';
import { hrefWith } from '@/components/console/toolbar';
import { Card, DataTable, EmptyState, Pagination, tableStyles } from '@/components/ui/display';
import { formatDateTime } from '@/lib/format';
import { requireShopView } from '@/server/auth/guards';
import { PAGE_SIZE, pageOf } from '@/server/services/records';
import { activityDetail, activityLog } from '@/server/services/reports';

export const metadata: Metadata = { title: 'Activity' };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const ctx = await requireShopView('settings');
  const page = pageOf(params.page);
  const { rows, total } = await activityLog(ctx.db, ctx.shop, page);
  return (
    <>
      <PageHeader title="Activity" description="Who did what in this shop, newest first." />
      <Card bodyless>
        <DataTable
          caption="Activity"
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Activity} title="No activity yet" />}
          columns={[
            { key: 'when', header: 'When', cell: (r) => formatDateTime(r.created_at) },
            { key: 'who', header: 'Who', cell: (r) => <>{r.actor} <span className={tableStyles.muted}>· {r.actor_type}</span></> },
            { key: 'what', header: 'What', cell: (r) => r.action },
            { key: 'detail', header: 'Details', cell: (r) => activityDetail(r.metadata) || <span className={tableStyles.muted}>—</span> },
          ]}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith('/shop/activity', {}, { page: p })} />
      </Card>
    </>
  );
}
