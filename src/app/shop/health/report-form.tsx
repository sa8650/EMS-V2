'use client';

import { ActionForm, FormGrid, TextField } from '@/components/ui/form';
import { healthReportAction } from './actions';

export function ReportForm({ from, to }: { from: string; to: string }) {
  return (
    <ActionForm action={healthReportAction} submitLabel="Create report">
      <FormGrid>
        <TextField label="From" name="from" type="date" defaultValue={from} />
        <TextField label="To" name="to" type="date" defaultValue={to} />
      </FormGrid>
    </ActionForm>
  );
}
