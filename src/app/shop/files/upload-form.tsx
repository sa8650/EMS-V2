'use client';

import { ActionForm, FormGrid, SelectField, TextField } from '@/components/ui/form';
import ui from '@/components/ui/ui.module.css';
import { uploadFilesAction } from './actions';

export function UploadForm() {
  return (
    <ActionForm action={uploadFilesAction} submitLabel="Upload" resetOnSuccess>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="vaultium-files">Files (up to 5, 5 MB each)</label>
        <input id="vaultium-files" name="files" type="file" multiple className={ui.control} />
      </div>
      <FormGrid>
        <SelectField label="Attach to" name="link" options={[{ value: '', label: 'Nothing (general file)' }, { value: 'invoice', label: 'An invoice' }, { value: 'expense', label: 'An expense' }]} optional />
        <TextField label="Invoice number or expense code" name="reference" optional placeholder="INV-000123 or EXP-0007" />
      </FormGrid>
    </ActionForm>
  );
}
