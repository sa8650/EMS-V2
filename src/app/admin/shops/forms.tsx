'use client';

import { Pencil, Plus } from 'lucide-react';
import { Dialog, useCloseDialog } from '@/components/ui/dialog';
import { ActionForm, FormGrid, TextArea, TextField } from '@/components/ui/form';
import { deleteShopAction, saveShopAction } from '../_actions/shops';

export interface ShopRecord {
  id: string;
  name: string;
  shop_code: string;
  category: string;
  address: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  website: string | null;
  low_stock_threshold: number;
}

export function ShopFields({ shop }: { shop?: Partial<ShopRecord> }) {
  return (
    <>
      <FormGrid>
        <TextField label="Shop name" name="name" defaultValue={shop?.name} />
        <TextField label="Business category" name="category" defaultValue={shop?.category ?? 'General Store'} />
      </FormGrid>
      <FormGrid>
        <TextField label="Phone" name="phone" type="tel" defaultValue={shop?.phone ?? ''} optional />
        <TextField label="Second phone" name="phone2" type="tel" defaultValue={shop?.phone2 ?? ''} optional />
      </FormGrid>
      <FormGrid>
        <TextField label="Email" name="email" type="email" defaultValue={shop?.email ?? ''} optional />
        <TextField label="Website" name="website" defaultValue={shop?.website ?? ''} optional />
      </FormGrid>
      <TextArea label="Address" name="address" rows={2} defaultValue={shop?.address ?? ''} optional hint="Printed on invoices." />
      <TextField label="Low-stock alert at" name="low_stock_threshold" type="number" min="0" defaultValue={String(shop?.low_stock_threshold ?? 5)} hint="Products at or below this quantity are flagged." />
    </>
  );
}

function ShopForm({ shop }: { shop?: ShopRecord }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={saveShopAction} submitLabel={shop ? 'Save shop' : 'Create shop'} onSuccess={close} resetOnSuccess={!shop}>
      {shop && <input type="hidden" name="id" value={shop.id} />}
      <ShopFields shop={shop} />
    </ActionForm>
  );
}

export function ShopDialog({ shop }: { shop?: ShopRecord }) {
  return (
    <Dialog
      title={shop ? `Edit ${shop.name}` : 'New shop'}
      trigger={shop ? <><Pencil aria-hidden /> Edit</> : <><Plus aria-hidden /> New shop</>}
      triggerVariant={shop ? 'ghost' : 'primary'}
      triggerSize={shop ? 'small' : 'default'}
      wide
    >
      <ShopForm shop={shop} />
    </Dialog>
  );
}

function DeleteForm({ shop }: { shop: ShopRecord }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={deleteShopAction} submitLabel="Delete shop permanently" submitVariant="danger" onSuccess={close}>
      <input type="hidden" name="id" value={shop.id} />
      <p>
        This permanently deletes <strong>{shop.name}</strong> with all its products, invoices, customers, staff and files. It cannot be undone.
      </p>
      <TextField label={`Type the Shop ID (${shop.shop_code}) to confirm`} name="confirm" inputMode="numeric" autoComplete="off" />
    </ActionForm>
  );
}

export function DeleteShopDialog({ shop }: { shop: ShopRecord }) {
  return (
    <Dialog title="Delete shop" trigger="Delete" triggerVariant="ghost" triggerSize="small">
      <DeleteForm shop={shop} />
    </Dialog>
  );
}
