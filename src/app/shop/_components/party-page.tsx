import { Truck, Users } from 'lucide-react';
import { PageHeader } from '@/components/console/bento';
import { ConfirmAction } from '@/components/console/confirm-action';
import { Toolbar, hrefWith } from '@/components/console/toolbar';
import { Card, DataTable, EmptyState, Pagination, tableStyles } from '@/components/ui/display';
import { formatMoney } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireShopView } from '@/server/auth/guards';
import { PAGE_SIZE, listParties, pageOf, partyDues, type PartyTable } from '@/server/services/records';
import { deletePartyAction } from '../_actions/records';
import { PartyDialog } from './record-forms';

const META = {
  customers: { title: 'Customers', section: 'customer', noun: 'customer', icon: Users, dueLabel: 'Owes you' },
  suppliers: { title: 'Suppliers', section: 'supplier', noun: 'supplier', icon: Truck, dueLabel: 'You owe' },
} as const;

export async function PartyPage({ table, searchParams }: { table: PartyTable; searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const ctx = await requireShopView(META[table].section);
  const m = META[table];
  const page = pageOf(params.page);
  const { rows, total } = await listParties(ctx.db, table, ctx.shop.id, { q: params.q, page });
  const dues = await partyDues(ctx.db, table, ctx.shop.id, rows.map((r) => r.id));
  const writable = !ctx.readOnly;
  const canAdd = writable && can(ctx.permissions, m.section, 'add');
  const canEdit = writable && can(ctx.permissions, m.section, 'edit');
  const canDelete = writable && can(ctx.permissions, m.section, 'delete');
  const base = `/shop/${table}`;

  return (
    <>
      <PageHeader title={m.title} description={`${total} ${m.noun}${total === 1 ? '' : 's'} in ${ctx.shop.name}.`} />
      <Card bodyless>
        <Toolbar q={params.q} placeholder={`Search name, phone, code or email`} actions={canAdd ? <PartyDialog table={table} /> : null} />
        <DataTable
          caption={m.title}
          rows={rows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState icon={m.icon} title={params.q ? 'No matches' : `No ${m.noun}s yet`}>
              {params.q ? 'Try another search.' : canAdd ? `Add your first ${m.noun}.` : undefined}
            </EmptyState>
          }
          columns={[
            { key: 'code', header: 'Code', cell: (r) => <span className={tableStyles.mono}>{r.code}</span> },
            { key: 'name', header: 'Name', cell: (r) => <strong>{r.name}</strong> },
            { key: 'phone', header: 'Phone', cell: (r) => [r.phone, r.phone2].filter(Boolean).join(', ') || <span className={tableStyles.muted}>—</span> },
            { key: 'email', header: 'Email', cell: (r) => r.email ?? <span className={tableStyles.muted}>—</span> },
            { key: 'due', header: m.dueLabel, numeric: true, cell: (r) => (dues.get(r.id) ? formatMoney(dues.get(r.id)) : <span className={tableStyles.muted}>—</span>) },
            {
              key: 'actions',
              header: <span className="visually-hidden">Actions</span>,
              cell: (r) => (
                <span style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                  {canEdit && <PartyDialog table={table} record={r} />}
                  {canDelete && (
                    <ConfirmAction
                      label="Delete"
                      title={`Delete ${m.noun}?`}
                      message={<>Delete <strong>{r.name}</strong>? This cannot be undone.</>}
                      confirmLabel="Delete"
                      action={deletePartyAction}
                      fields={{ table, id: r.id }}
                    />
                  )}
                </span>
              ),
            },
          ]}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith(base, { q: params.q }, { page: p })} />
      </Card>
    </>
  );
}
