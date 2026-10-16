'use client';

import { useState } from 'react';
import { Dialog, useCloseDialog } from '@/components/ui/dialog';
import { ActionForm, FormGrid, SelectField, TextField } from '@/components/ui/form';
import { formatMoney } from '@/lib/format';
import { purchaseAddonAction } from '../_actions/account';

export interface AddonOffer { key: string; title: string; unit_price: number; min_days: number; max_days: number; min_limit: number; max_limit: number; unit: string }

function BuyForm({ offer, paymentInfo }: { offer: AddonOffer; paymentInfo: string }) {
  const close = useCloseDialog();
  const [days, setDays] = useState(String(offer.min_days));
  const [limit, setLimit] = useState(String(Math.max(1, offer.min_limit)));
  const amount = Number(days || 0) * (offer.key === 'truebill' ? 1 : Number(limit || 0)) * offer.unit_price;
  return (
    <ActionForm action={purchaseAddonAction} submitLabel="Send request" onSuccess={close}>
      <input type="hidden" name="addon_key" value={offer.key} />
      <FormGrid>
        <TextField label={`Days (${offer.min_days}–${offer.max_days})`} name="days" type="number" min={offer.min_days} max={offer.max_days} value={days} onChange={(e) => setDays(e.target.value)} />
        {offer.key !== 'truebill' && <TextField label={`${offer.unit} (${offer.min_limit}–${offer.max_limit})`} name="daily_limit" type="number" min={offer.min_limit} max={offer.max_limit} value={limit} onChange={(e) => setLimit(e.target.value)} />}
      </FormGrid>
      <p>Price before coupon: <strong>{formatMoney(amount)}</strong></p>
      {paymentInfo && <p style={{ whiteSpace: 'pre-line', padding: 'var(--space-3)', borderRadius: 'var(--radius)', background: 'var(--surface-sunken)' }}>{paymentInfo}</p>}
      <TextField label="Coupon" name="coupon" optional autoComplete="off" />
      <SelectField label="Paid with" name="payment_method" options={[{ value: 'bkash', label: 'bKash' }, { value: 'nagad', label: 'Nagad' }, { value: 'bank', label: 'Bank transfer' }, { value: 'other', label: 'Other' }]} />
      <FormGrid>
        <TextField label="Paid from (number or account)" name="payment_number" autoComplete="off" />
        <TextField label="Transaction ID" name="transaction_id" autoComplete="off" />
      </FormGrid>
    </ActionForm>
  );
}

export function BuyAddonDialog({ offer, paymentInfo }: { offer: AddonOffer; paymentInfo: string }) {
  return (
    <Dialog title={`Buy ${offer.title}`} trigger="Buy">
      <BuyForm offer={offer} paymentInfo={paymentInfo} />
    </Dialog>
  );
}
