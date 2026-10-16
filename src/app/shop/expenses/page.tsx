import { Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Bento, PageHeader, Tile } from '@/components/console/bento';
import { ConfirmAction } from '@/components/console/confirm-action';
import { Toolbar, hrefWith } from '@/components/console/toolbar';
import { Badge, Card, DataTable, EmptyState, Pagination, Stat, tableStyles } from '@/components/ui/display';
import ui from '@/components/ui/ui.module.css';
import { isYmd, monthRange, today } from '@/lib/dates';
import { formatDate, formatMoney } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireShopView } from '@/server/auth/guards';
import { PAGE_SIZE, listExpenses, pageOf } from '@/server/services/records';
import { deleteExpenseAction } from '../_actions/records';
import { ExpenseDialog } from '../_components/record-forms';

export const metadata: Metadata = { title: 'Expenses' };

type Params = { q?: string; page?: string; from?: string; to?: string };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const ctx = await requireShopView('expense');
  const month = monthRange(today());
  const from = isYmd(params.from) ? params.from : month.from;
  const to = isYmd(params.to) ? params.to : month.to;
  const page = pageOf(params.page);
  const data = await listExpenses(ctx.db, ctx.shop.id, { q: params.q, page, from, to });
  const writable = !ctx.readOnly;
  const keep = { q: params.q, from, to };

  return (
    <>
      <PageHeader title="Expenses" description={`${formatDate(from)} – ${formatDate(to)}`} />
      <Bento>
        <Tile span={4} title="Spent in this period" icon={Wallet} accent>
          <Stat label="Total" value={formatMoney(data.sum)} note={`${data.total} expense${data.total === 1 ? '' : 's'}`} />
        </Tile>
        <Tile span={4} title="Still to pay">
          <Stat label="Unpaid" value={formatMoney(data.due)} note={<Link href="/shop/dues?tab=payable">Pay from Dues</Link>} />
        </Tile>
      </Bento>
      <Card bodyless>
        <Toolbar
          q={params.q}
          placeholder="Search details, code or note"
          filters={
            <>
              <input type="date" name="from" defaultValue={from} className={ui.control} aria-label="From date" style={{ maxWidth: 160 }} />
              <input type="date" name="to" defaultValue={to} className={ui.control} aria-label="To date" style={{ maxWidth: 160 }} />
            </>
          }
          actions={writable && can(ctx.permissions, 'expense', 'add') ? <ExpenseDialog /> : null}
        />
        <DataTable
          caption="Expenses"
          rows={data.rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Wallet} title="No expenses in this period" />}
          columns={[
            { key: 'date', header: 'Date', cell: (r) => formatDate(r.expense_date) },
            { key: 'code', header: 'Code', cell: (r) => <span className={tableStyles.mono}>{r.code}</span> },
            { key: 'details', header: 'Details', cell: (r) => <><strong>{r.details}</strong>{r.note && <span className={tableStyles.muted}> · {r.note}</span>}</> },
            { key: 'total', header: 'Total', numeric: true, cell: (r) => formatMoney(r.total) },
            { key: 'due', header: 'Due', numeric: true, cell: (r) => (Number(r.due) > 0 ? <Badge tone="warning">{formatMoney(r.due)}</Badge> : <Badge tone="success">Paid</Badge>) },
            {
              key: 'actions',
              header: <span className="visually-hidden">Actions</span>,
              cell: (r) => (
                <span style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                  {writable && can(ctx.permissions, 'expense', 'edit') && <ExpenseDialog record={r} />}
                  {writable && can(ctx.permissions, 'expense', 'delete') && (
                    <ConfirmAction label="Delete" title="Delete expense?" message={<>Delete <strong>{r.code}</strong> ({formatMoney(r.total)})?</>} confirmLabel="Delete" action={deleteExpenseAction} fields={{ id: r.id }} />
                  )}
                </span>
              ),
            },
          ]}
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} href={(p) => hrefWith('/shop/expenses', keep, { page: p })} />
      </Card>
    </>
  );
}
