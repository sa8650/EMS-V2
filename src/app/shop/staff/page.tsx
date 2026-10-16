import { CalendarCheck, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/console/bento';
import { ConfirmAction } from '@/components/console/confirm-action';
import { Badge, Card, DataTable, EmptyState, Tabs, tableStyles } from '@/components/ui/display';
import ui from '@/components/ui/ui.module.css';
import { isYmd, today } from '@/lib/dates';
import { formatDate, formatMoney } from '@/lib/format';
import { can, normalizePermissions } from '@/lib/permissions';
import { requireShopView, type ShopContext } from '@/server/auth/guards';
import { attendanceForDay, listStaff, monthAttendance, PERMISSION_GRID, salaryBalances, salaryHistory } from '@/server/services/staff';
import { deleteSalaryAction, deleteStaffAction, setStaffActiveAction } from './actions';
import { AdvanceDialog, AttendanceSheet, PayDueDialog, SalaryDialog, StaffDialog, type StaffRecord } from './forms';

export const metadata: Metadata = { title: 'Staff' };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ tab?: string; date?: string; month?: string }> }) {
  const params = await searchParams;
  const ctx = await requireShopView('staff', 'attendance', 'salary');
  const p = ctx.permissions;
  const writable = !ctx.readOnly;
  const tabs = [
    can(p, 'staff', 'view') && { key: 'staff', label: 'Staff', href: '/shop/staff' },
    can(p, 'attendance', 'view') && { key: 'attendance', label: 'Attendance', href: '/shop/staff?tab=attendance' },
    can(p, 'salary', 'view') && { key: 'salary', label: 'Salary', href: '/shop/staff?tab=salary' },
  ].filter(Boolean) as { key: string; label: string; href: string }[];
  const tab = tabs.find((t) => t.key === params.tab)?.key ?? tabs[0]?.key ?? 'staff';
  const staff: (StaffRecord & { active: boolean })[] = (await listStaff(ctx.db, ctx.shop.id)).map((s) => ({ ...s, basic_salary: Number(s.basic_salary), permissions: normalizePermissions(s.permissions) }));
  const active = new Map(staff.map((s) => [s.id, s.active]));

  return (
    <>
      <PageHeader title="Staff" description={`Staff sign in with Shop ID ${ctx.shop.shop_code} and their user ID.`} actions={tab === 'staff' && writable && can(p, 'staff', 'add') ? <StaffDialog grid={PERMISSION_GRID} /> : null} />
      <Tabs label="Staff sections" current={tab} items={tabs} />
      {tab === 'staff' && (
        <Card bodyless>
          <DataTable
            caption="Staff"
            rows={staff}
            rowKey={(s) => s.id}
            empty={<EmptyState icon={Users} title="No staff yet">Add staff and choose what each person may do.</EmptyState>}
            columns={[
              { key: 'name', header: 'Name', cell: (s) => <><strong>{s.full_name}</strong>{s.position && <span className={tableStyles.muted}> · {s.position}</span>}</> },
              { key: 'user', header: 'User ID', cell: (s) => <span className={tableStyles.mono}>{s.user_id}</span> },
              { key: 'contact', header: 'Contact', cell: (s) => [s.phone, s.email].filter(Boolean).join(' · ') || '—' },
              { key: 'salary', header: 'Monthly salary', numeric: true, cell: (s) => formatMoney(s.basic_salary) },
              { key: 'status', header: 'Status', cell: (s) => (active.get(s.id) ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>) },
              {
                key: 'actions',
                header: <span className="visually-hidden">Actions</span>,
                cell: (s) =>
                  writable ? (
                    <span style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                      {can(p, 'staff', 'edit') && <StaffDialog staff={s} grid={PERMISSION_GRID} />}
                      {can(p, 'staff', 'edit') && (
                        <ConfirmAction label={active.get(s.id) ? 'Deactivate' : 'Activate'} title={active.get(s.id) ? 'Deactivate staff?' : 'Activate staff?'} message={<>{active.get(s.id) ? 'Signing in will be blocked for' : 'Allow signing in again for'} <strong>{s.full_name}</strong>.</>} confirmLabel={active.get(s.id) ? 'Deactivate' : 'Activate'} danger={!!active.get(s.id)} action={setStaffActiveAction} fields={{ id: s.id, active: String(!active.get(s.id)) }} />
                      )}
                      {can(p, 'staff', 'delete') && (
                        <ConfirmAction label="Delete" title="Delete staff?" message={<>Delete <strong>{s.full_name}</strong> with their attendance and salary records?</>} confirmLabel="Delete" action={deleteStaffAction} fields={{ id: s.id }} />
                      )}
                    </span>
                  ) : null,
              },
            ]}
          />
        </Card>
      )}
      {tab === 'attendance' && <Attendance ctx={ctx} date={isYmd(params.date) ? params.date : today()} canEdit={writable && can(p, 'attendance', 'add')} />}
      {tab === 'salary' && <Salary ctx={ctx} staff={staff} month={/^\d{4}-\d{2}$/.test(params.month ?? '') ? params.month! : today().slice(0, 7)} />}
    </>
  );
}

type Ctx = ShopContext;

async function Attendance({ ctx, date, canEdit }: { ctx: Ctx; date: string; canEdit: boolean }) {
  const rows = await attendanceForDay(ctx.db, ctx.shop.id, date);
  return (
    <Card
      title={`Attendance — ${formatDate(date)}`}
      actions={
        <form method="get" style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <input type="hidden" name="tab" value="attendance" />
          <input type="date" name="date" defaultValue={date} className={ui.control} aria-label="Date" />
          <button className={ui.button} type="submit">Show</button>
        </form>
      }
    >
      {!rows.length ? (
        <EmptyState icon={CalendarCheck} title="No active staff" />
      ) : canEdit ? (
        <AttendanceSheet date={date} rows={rows} />
      ) : (
        <ul className={tableStyles.muted}>
          {rows.map((r) => <li key={r.id}>{r.full_name}: {r.status ?? 'not recorded'}</li>)}
        </ul>
      )}
    </Card>
  );
}

async function Salary({ ctx, staff, month }: { ctx: Ctx; staff: StaffRecord[]; month: string }) {
  const [balances, att, history] = await Promise.all([salaryBalances(ctx.db, ctx.shop.id), monthAttendance(ctx.db, ctx.shop.id, month), salaryHistory(ctx.db, ctx.shop.id)]);
  const canPay = !ctx.readOnly && can(ctx.permissions, 'salary', 'add');
  const canDelete = !ctx.readOnly && can(ctx.permissions, 'salary', 'delete');
  return (
    <>
      <Card title="Salary overview" bodyless>
        <DataTable
          caption="Salary overview"
          rows={staff}
          rowKey={(s) => s.id}
          empty={<EmptyState icon={Users} title="No staff yet" />}
          columns={[
            { key: 'name', header: 'Staff', cell: (s) => <strong>{s.full_name}</strong> },
            { key: 'monthly', header: 'Monthly', numeric: true, cell: (s) => formatMoney(s.basic_salary) },
            { key: 'present', header: `Present in ${month}`, numeric: true, cell: (s) => `${att.byStaff.get(s.id)?.present ?? 0} / ${att.days}` },
            { key: 'advance', header: 'Open advance', numeric: true, cell: (s) => formatMoney(balances.get(s.id)?.advanceBalance ?? 0) },
            { key: 'due', header: 'Salary due', numeric: true, cell: (s) => formatMoney(balances.get(s.id)?.outstanding ?? 0) },
            { key: 'ytd', header: 'Paid this year', numeric: true, cell: (s) => formatMoney(balances.get(s.id)?.paidThisYear ?? 0) },
            {
              key: 'actions',
              header: <span className="visually-hidden">Actions</span>,
              cell: (s) => (canPay ? <span style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}><SalaryDialog staff={s} month={month} presentDays={att.byStaff.get(s.id)?.present ?? 0} totalDays={att.days} advanceBalance={balances.get(s.id)?.advanceBalance ?? 0} /><AdvanceDialog staff={s} month={month} /></span> : null),
            },
          ]}
        />
      </Card>
      <Card title="Recent salary payments" bodyless>
        <DataTable
          caption="Salary payments"
          rows={history}
          rowKey={(r) => r.id}
          empty={<EmptyState title="No salary payments yet" />}
          columns={[
            { key: 'month', header: 'Month', cell: (r) => r.month },
            { key: 'staff', header: 'Staff', cell: (r) => r.staff?.full_name ?? '—' },
            { key: 'type', header: 'Type', cell: (r) => (r.type === 'advance' ? <Badge tone="info">Advance</Badge> : 'Salary') },
            { key: 'total', header: 'Total', numeric: true, cell: (r) => formatMoney(r.total) },
            { key: 'due', header: 'Due', numeric: true, cell: (r) => (Number(r.due) > 0 ? <Badge tone="warning">{formatMoney(r.due)}</Badge> : <Badge tone="success">Paid</Badge>) },
            {
              key: 'actions',
              header: <span className="visually-hidden">Actions</span>,
              cell: (r) => (
                <span style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                  {canPay && Number(r.due) > 0 && <PayDueDialog id={r.id} due={Number(r.due)} />}
                  {canDelete && <ConfirmAction label="Delete" title="Delete payment?" message={`Delete this ${r.type} record for ${r.month}?`} confirmLabel="Delete" action={deleteSalaryAction} fields={{ id: r.id }} />}
                </span>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
