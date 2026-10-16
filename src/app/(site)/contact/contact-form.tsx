'use client';

import { ActionForm, FormGrid, TextArea, TextField } from '@/components/ui/form';
import { sendContactMessage } from './actions';

export function ContactForm() {
  return (
    <ActionForm action={sendContactMessage} submitLabel="Send message" resetOnSuccess>
      <FormGrid>
        <TextField label="Name" name="name" autoComplete="name" />
        <TextField label="Email" name="email" type="email" autoComplete="email" />
      </FormGrid>
      <FormGrid>
        <TextField label="Phone" name="phone" type="tel" autoComplete="tel" optional />
        <TextField label="Subject" name="subject" optional />
      </FormGrid>
      <TextArea label="Message" name="message" rows={6} />
      {/* Honeypot for bots: hidden from people and assistive technology. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }} />
    </ActionForm>
  );
}
