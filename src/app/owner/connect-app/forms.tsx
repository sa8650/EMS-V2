'use client';

import { ActionForm, FormGrid, TextField } from '@/components/ui/form';
import { dispatchSmsAction, requestConnectionAction, saveEndpointAction } from '../_actions/connect';

export function RequestForm() {
  return (
    <ActionForm action={requestConnectionAction} submitLabel="Send pairing request" resetOnSuccess>
      <FormGrid>
        <TextField label="Other app’s Connect Endpoint" name="remote_endpoint" placeholder="https://…/connect" />
        <TextField label="Show this installation as" name="display_name" optional />
      </FormGrid>
    </ActionForm>
  );
}

export function EndpointForm({ value }: { value: string }) {
  return (
    <ActionForm action={saveEndpointAction} submitLabel="Save endpoint">
      <TextField label="Public Connect Endpoint (optional override)" name="endpoint" defaultValue={value} optional hint="Leave empty to use this site’s address + /connect." />
    </ActionForm>
  );
}

export function DispatchForm() {
  return (
    <ActionForm action={dispatchSmsAction} submitLabel="Send waiting SMS now">
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>SMS are normally passed to the gateway as soon as they are queued.</p>
    </ActionForm>
  );
}
