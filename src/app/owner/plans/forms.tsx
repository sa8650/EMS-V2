'use client';

import { Pencil, Plus } from 'lucide-react';
import { Dialog, useCloseDialog } from '@/components/ui/dialog';
import { ActionForm, CheckboxField, FormGrid, TextArea, TextField } from '@/components/ui/form';
import { ADDON_INFO, ADDON_KEYS } from '@/config/modules';
import { savePlanAction } from '../_actions/licensing';

export interface PlanRecord {
  id: string;
  title: string;
  duration_months: number;
  max_shops: number;
  price: number;
  benefits: string | null;
  payment_details: string | null;
  active: boolean;
  modules: Partial<Record<(typeof ADDON_KEYS)[number], number>>;
}

function PlanForm({ plan }: { plan?: PlanRecord }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={savePlanAction} submitLabel={plan ? 'Save plan' : 'Create plan'} onSuccess={close} resetOnSuccess={!plan}>
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <TextField label="Plan name" name="title" defaultValue={plan?.title} />
      <FormGrid>
        <TextField label="Price (৳)" name="price" type="number" min="0" step="0.01" defaultValue={plan ? String(plan.price) : ''} />
        <TextField label="Duration (months)" name="duration_months" type="number" min="1" defaultValue={plan ? String(plan.duration_months) : '1'} />
        <TextField label="Shops included" name="max_shops" type="number" min="1" defaultValue={plan ? String(plan.max_shops) : '1'} />
      </FormGrid>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 'var(--space-3)' }}>
        <legend style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>Included add-ons (0 = not included)</legend>
        <FormGrid>
          {ADDON_KEYS.filter((k) => k !== 'truebill').map((k) => (
            <TextField key={k} label={`${ADDON_INFO[k].name} (${ADDON_INFO[k].unit})`} name={`module_${k}`} type="number" min="0" defaultValue={String(plan?.modules[k] ?? 0)} />
          ))}
        </FormGrid>
        <CheckboxField label="TrueBill invoice verification" name="module_truebill" defaultChecked={!!plan?.modules.truebill} />
      </fieldset>
      <TextArea label="Benefits" name="benefits" rows={3} defaultValue={plan?.benefits ?? ''} optional hint="One per line; shown on the pricing page." />
      <TextArea label="Payment instructions" name="payment_details" rows={3} defaultValue={plan?.payment_details ?? ''} optional hint="Shown to administrators when they request this plan." />
      <CheckboxField label="Available to administrators" name="active" defaultChecked={plan ? plan.active : true} />
    </ActionForm>
  );
}

export function PlanDialog({ plan }: { plan?: PlanRecord }) {
  return (
    <Dialog
      title={plan ? `Edit ${plan.title}` : 'New licence plan'}
      trigger={plan ? <><Pencil aria-hidden /> Edit</> : <><Plus aria-hidden /> New plan</>}
      triggerVariant={plan ? 'ghost' : 'primary'}
      triggerSize={plan ? 'small' : 'default'}
      wide
    >
      <PlanForm plan={plan} />
    </Dialog>
  );
}
