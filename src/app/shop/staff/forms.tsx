'use client';

import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Dialog, useCloseDialog } from '@/components/ui/dialog';
import { ActionForm, CheckboxField, FormGrid, TextArea, TextField } from '@/components/ui/form';
import ui from '@/components/ui/ui.module.css';
import { SECTION_LABELS, type PermissionMap, type PermissionSection, type PermissionVerb } from '@/lib/permissions';
import { createSalaryAction, paySalaryDueAction, saveAttendanceAction, saveStaffAction } from './actions';

export interface StaffRecord {
  id: string;
  full_name: string;
  user_id: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  basic_salary: number;
  permissions: PermissionMap;
}

const VERB_LABEL: Record<PermissionVerb, string> = { view: 'View', add: 'Add', edit: 'Edit', delete: 'Delete', send: 'Send' };

function StaffForm({ staff, grid }: { staff?: StaffRecord; grid: { section: PermissionSection; verbs: readonly PermissionVerb[] }[] }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={saveStaffAction} submitLabel={staff ? 'Save' : 'Add staff'} onSuccess={close} resetOnSuccess={!staff}>
      {staff && <input type="hidden" name="id" value={staff.id} />}
      <FormGrid>
        <TextField label="Full name" name="full_name" defaultValue={staff?.full_name} />
        <TextField label="User ID" name="user_id" defaultValue={staff?.user_id} autoComplete="off" hint="Used to sign in with the Shop ID." />
      </FormGrid>
      <FormGrid>
        <TextField label={staff ? 'New password' : 'Password'} name="password" type="password" autoComplete="new-password" optional={!!staff} hint={staff ? 'Leave empty to keep the current password.' : 'At least 8 characters.'} />
        <TextField label="Position" name="position" defaultValue={staff?.position ?? ''} optional />
      </FormGrid>
      <FormGrid>
        <TextField label="Phone" name="phone" type="tel" defaultValue={staff?.phone ?? ''} optional />
        <TextField label="Email" name="email" type="email" defaultValue={staff?.email ?? ''} optional hint="Needed to reset a forgotten password." />
        <TextField label="Monthly salary (৳)" name="basic_salary" type="number" min="0" step="0.01" defaultValue={String(staff?.basic_salary ?? 0)} />
      </FormGrid>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={ui.label}>Permissions</legend>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <tbody>
              {grid.map((g) => (
                <tr key={g.section}>
                  <th scope="row" style={{ textTransform: 'none', position: 'static' }}>{SECTION_LABELS[g.section]}</th>
                  <td>
                    <span style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                      {g.verbs.map((v) => (
                        <CheckboxField key={v} label={VERB_LABEL[v]} name="perm" value={`${g.section}:${v}`} defaultChecked={staff?.permissions[g.section]?.includes(v)} />
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>
    </ActionForm>
  );
}

export function StaffDialog({ staff, grid }: { staff?: StaffRecord; grid: { section: PermissionSection; verbs: readonly PermissionVerb[] }[] }) {
  return (
    <Dialog title={staff ? `Edit ${staff.full_name}` : 'Add staff'} trigger={staff ? <><Pencil aria-hidden /> Edit</> : <><Plus aria-hidden /> Add staff</>} triggerVariant={staff ? 'ghost' : 'primary'} triggerSize={staff ? 'small' : 'default'} wide>
      <StaffForm staff={staff} grid={grid} />
    </Dialog>
  );
}

export function AttendanceSheet({ date, rows }: { date: string; rows: { id: string; full_name: string; position: string | null; status: 'present' | 'absent' | null }[] }) {
  return (
    <ActionForm action={saveAttendanceAction} submitLabel="Save attendance">
      <input type="hidden" name="date" value={date} />
      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead>
            <tr><th scope="col">Staff</th><th scope="col">Present</th><th scope="col">Absent</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.full_name}</strong>{r.position && <span className={ui.muted}> · {r.position}</span>}</td>
                <td><input type="radio" name={`status:${r.id}`} value="present" defaultChecked={r.status === 'present'} aria-label={`${r.full_name} present`} /></td>
                <td><input type="radio" name={`status:${r.id}`} value="absent" defaultChecked={r.status === 'absent'} aria-label={`${r.full_name} absent`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ActionForm>
  );
}

function SalaryForm({ staff, month, presentDays, totalDays, advanceBalance }: { staff: StaffRecord; month: string; presentDays: number; totalDays: number; advanceBalance: number }) {
  const close = useCloseDialog();
  const [attendance, setAttendance] = useState(false);
  return (
    <ActionForm action={createSalaryAction} submitLabel="Record salary" onSuccess={close}>
      <input type="hidden" name="staff_id" value={staff.id} />
      <input type="hidden" name="type" value="salary" />
      <FormGrid>
        <TextField label="Month" name="month" type="month" defaultValue={month} />
        <TextField label="Base salary (৳)" name="base_amount" type="number" min="0" step="0.01" defaultValue={String(staff.basic_salary)} />
      </FormGrid>
      <CheckboxField label={`Pay by attendance (${presentDays} of ${totalDays} days recorded present)`} name="attendance_based" checked={attendance} onChange={(e) => setAttendance(e.target.checked)} />
      {attendance && (
        <FormGrid>
          <TextField label="Present days" name="present_days" type="number" min="0" max="31" defaultValue={String(presentDays)} />
          <TextField label="Days in month" name="total_days" type="number" min="1" max="31" defaultValue={String(totalDays)} />
        </FormGrid>
      )}
      <FormGrid>
        <TextField label="Incentive" name="incentive" type="number" min="0" step="0.01" defaultValue="0" />
        <TextField label="Bonus" name="bonus" type="number" min="0" step="0.01" defaultValue="0" />
        <TextField label="Fine" name="fine" type="number" min="0" step="0.01" defaultValue="0" />
        <TextField label="Other deduction" name="other_deduction" type="number" min="0" step="0.01" defaultValue="0" />
      </FormGrid>
      <FormGrid>
        <TextField label="Repay advance" name="advance_deducted" type="number" min="0" max={advanceBalance} step="0.01" defaultValue="0" hint={`${advanceBalance.toFixed(2)} of advances open`} />
        <TextField label="Paid now (৳)" name="paid" type="number" min="0" step="0.01" defaultValue="0" hint="The rest stays as salary due." />
      </FormGrid>
      <TextArea label="Note" name="note" rows={2} optional />
    </ActionForm>
  );
}

export function SalaryDialog(props: { staff: StaffRecord; month: string; presentDays: number; totalDays: number; advanceBalance: number }) {
  return (
    <Dialog title={`Salary — ${props.staff.full_name}`} trigger="Pay salary" triggerSize="small" wide>
      <SalaryForm {...props} />
    </Dialog>
  );
}

function AdvanceForm({ staff, month }: { staff: StaffRecord; month: string }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={createSalaryAction} submitLabel="Record advance" onSuccess={close}>
      <input type="hidden" name="staff_id" value={staff.id} />
      <input type="hidden" name="type" value="advance" />
      <FormGrid>
        <TextField label="Month" name="month" type="month" defaultValue={month} />
        <TextField label="Advance amount (৳)" name="paid" type="number" min="0.01" step="0.01" />
      </FormGrid>
      <TextArea label="Note" name="note" rows={2} optional />
    </ActionForm>
  );
}

export function AdvanceDialog({ staff, month }: { staff: StaffRecord; month: string }) {
  return (
    <Dialog title={`Advance — ${staff.full_name}`} trigger="Advance" triggerSize="small" triggerVariant="ghost">
      <AdvanceForm staff={staff} month={month} />
    </Dialog>
  );
}

function PayDueForm({ id, due }: { id: string; due: number }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={paySalaryDueAction} submitLabel="Record payment" onSuccess={close}>
      <input type="hidden" name="id" value={id} />
      <TextField label="Amount (৳)" name="amount" type="number" min="0.01" max={due} step="0.01" defaultValue={due.toFixed(2)} />
    </ActionForm>
  );
}

export function PayDueDialog({ id, due }: { id: string; due: number }) {
  return (
    <Dialog title="Pay remaining salary" trigger="Pay" triggerSize="small">
      <PayDueForm id={id} due={due} />
    </Dialog>
  );
}
