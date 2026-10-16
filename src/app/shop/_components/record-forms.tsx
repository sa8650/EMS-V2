'use client';

import { Pencil, Plus } from 'lucide-react';
import { Dialog, useCloseDialog } from '@/components/ui/dialog';
import { ActionForm, FormGrid, TextArea, TextField } from '@/components/ui/form';
import { today } from '@/lib/dates';
import { saveExpenseAction, savePartyAction, saveProductAction } from '../_actions/records';

type Maybe<T> = T | null | undefined;

interface PartyRecord { id: string; name: string; phone: Maybe<string>; phone2: Maybe<string>; email: Maybe<string>; address: Maybe<string> }

function PartyForm({ table, record }: { table: 'customers' | 'suppliers'; record?: PartyRecord }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={savePartyAction} submitLabel={record ? 'Save changes' : 'Add'} onSuccess={close} resetOnSuccess={!record}>
      <input type="hidden" name="table" value={table} />
      {record && <input type="hidden" name="id" value={record.id} />}
      <TextField label="Name" name="name" defaultValue={record?.name} autoComplete="off" />
      <FormGrid>
        <TextField label="Phone" name="phone" type="tel" defaultValue={record?.phone ?? ''} optional />
        <TextField label="Second phone" name="phone2" type="tel" defaultValue={record?.phone2 ?? ''} optional />
      </FormGrid>
      <TextField label="Email" name="email" type="email" defaultValue={record?.email ?? ''} optional />
      <TextArea label="Address" name="address" rows={2} defaultValue={record?.address ?? ''} optional />
    </ActionForm>
  );
}

export function PartyDialog({ table, record }: { table: 'customers' | 'suppliers'; record?: PartyRecord }) {
  const noun = table === 'customers' ? 'customer' : 'supplier';
  return (
    <Dialog
      title={record ? `Edit ${noun}` : `Add ${noun}`}
      trigger={record ? <><Pencil aria-hidden /> Edit</> : <><Plus aria-hidden /> Add {noun}</>}
      triggerVariant={record ? 'ghost' : 'primary'}
      triggerSize={record ? 'small' : 'default'}
    >
      <PartyForm table={table} record={record} />
    </Dialog>
  );
}

interface ProductRecord { id: string; name: string; category: Maybe<string>; unit: string; sale_price: number }

function ProductForm({ record }: { record?: ProductRecord }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={saveProductAction} submitLabel={record ? 'Save changes' : 'Add product'} onSuccess={close} resetOnSuccess={!record}>
      {record && <input type="hidden" name="id" value={record.id} />}
      <TextField label="Product name" name="name" defaultValue={record?.name} autoComplete="off" />
      <FormGrid>
        <TextField label="Category" name="category" defaultValue={record?.category ?? ''} optional />
        <TextField label="Unit" name="unit" defaultValue={record?.unit ?? 'pcs'} hint="pcs, kg, box…" />
      </FormGrid>
      <TextField label="Sale price (৳)" name="sale_price" type="number" step="0.01" min="0" defaultValue={record ? String(record.sale_price) : ''} />
    </ActionForm>
  );
}

export function ProductDialog({ record }: { record?: ProductRecord }) {
  return (
    <Dialog
      title={record ? 'Edit product' : 'Add product'}
      trigger={record ? <><Pencil aria-hidden /> Edit</> : <><Plus aria-hidden /> Add product</>}
      triggerVariant={record ? 'ghost' : 'primary'}
      triggerSize={record ? 'small' : 'default'}
    >
      <ProductForm record={record} />
    </Dialog>
  );
}

interface ExpenseRecord { id: string; expense_date: string; details: string; total: number; paid: number; note: Maybe<string> }

function ExpenseForm({ record }: { record?: ExpenseRecord }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={saveExpenseAction} submitLabel={record ? 'Save changes' : 'Record expense'} onSuccess={close} resetOnSuccess={!record}>
      {record && <input type="hidden" name="id" value={record.id} />}
      <TextField label="Details" name="details" defaultValue={record?.details} autoComplete="off" />
      <FormGrid>
        <TextField label="Date" name="expense_date" type="date" defaultValue={record?.expense_date ?? today()} />
        <TextField label="Total (৳)" name="total" type="number" step="0.01" min="0" defaultValue={record ? String(record.total) : ''} />
        <TextField label="Paid now (৳)" name="paid" type="number" step="0.01" min="0" defaultValue={record ? String(record.paid) : '0'} hint="The rest becomes a due." />
      </FormGrid>
      <TextArea label="Note" name="note" rows={2} defaultValue={record?.note ?? ''} optional />
    </ActionForm>
  );
}

export function ExpenseDialog({ record }: { record?: ExpenseRecord }) {
  return (
    <Dialog
      title={record ? 'Edit expense' : 'Record expense'}
      trigger={record ? <><Pencil aria-hidden /> Edit</> : <><Plus aria-hidden /> Record expense</>}
      triggerVariant={record ? 'ghost' : 'primary'}
      triggerSize={record ? 'small' : 'default'}
    >
      <ExpenseForm record={record} />
    </Dialog>
  );
}
