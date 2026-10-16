'use client';

import { ActionForm, CheckboxField, FormGrid, SelectField, TextArea, TextField } from '@/components/ui/form';
import { saveSmsSettingsAction, sendEmailAction, sendSmsAction } from './actions';

export function EmailForm({ recipients }: { recipients: { value: string; label: string }[] }) {
  return (
    <ActionForm action={sendEmailAction} submitLabel="Send email" resetOnSuccess>
      <FormGrid>
        <SelectField label="Recipient" name="recipient" options={[{ value: '', label: 'Enter addresses below' }, ...recipients]} optional />
        <TextField label="To (more addresses)" name="to" placeholder="name@example.com, …" optional />
      </FormGrid>
      <TextField label="CC" name="cc" optional />
      <TextField label="Subject" name="subject" />
      <TextArea label="Message" name="message" rows={5} optional />
      <TextField label="Attach a document" name="document" placeholder="INV-000123, RET-000004 or EXC-000002" optional hint="The document is added below your message." />
    </ActionForm>
  );
}

export function SmsForm() {
  return (
    <ActionForm action={sendSmsAction} submitLabel="Queue SMS" resetOnSuccess>
      <TextField label="Phone number" name="phone" type="tel" />
      <TextArea label="Message" name="message" rows={3} hint="Long messages are sent as several SMS by the phone." />
    </ActionForm>
  );
}

const EVENTS: { key: string; label: string; flag?: string }[] = [
  { key: 'SALE', label: 'After a sale', flag: 'auto_sale' },
  { key: 'PAYMENT', label: 'After a due payment', flag: 'auto_payment' },
  { key: 'RETURN', label: 'After a return', flag: 'auto_return' },
  { key: 'REFUND', label: 'When a refund is paid', flag: 'auto_refund' },
  { key: 'EXCHANGE', label: 'After an exchange', flag: 'auto_exchange' },
  { key: 'DUE_REMINDER', label: 'Due reminder (sent manually)' },
  { key: 'TEST', label: 'Test message' },
];

export function SmsSettingsForm({ settings }: { settings: { enabled: boolean; templates: Record<string, string> } & Record<string, unknown> }) {
  return (
    <ActionForm action={saveSmsSettingsAction} submitLabel="Save SMS settings">
      <CheckboxField label="Send SMS from this shop" name="enabled" defaultChecked={settings.enabled} />
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Placeholders: {'{name} {shop} {invoice} {total} {paid} {due} {amount}'}</p>
      {EVENTS.map((e) => (
        <div key={e.key} style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {e.flag ? <CheckboxField label={`Send automatically: ${e.label.toLowerCase()}`} name={e.flag} defaultChecked={!!settings[e.flag]} /> : <strong style={{ fontSize: 'var(--text-sm)' }}>{e.label}</strong>}
          <TextArea label={`${e.label} — template`} name={`template:${e.key}`} rows={2} defaultValue={settings.templates[e.key]} optional />
        </div>
      ))}
    </ActionForm>
  );
}
