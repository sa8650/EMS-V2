'use client';

import { Pencil, Plus } from 'lucide-react';
import { Dialog, useCloseDialog } from '@/components/ui/dialog';
import { ActionForm, CheckboxField, FormGrid, TextArea, TextField } from '@/components/ui/form';
import ui from '@/components/ui/ui.module.css';
import { saveAppAction } from './actions';

export interface AppRecord {
  id: string; package_name: string; title: string; description: string | null; version: string; version_code: number; release_notes: string | null;
  mandatory: boolean; published: boolean; apk_url: string | null; icon_url: string | null; apk_filename: string | null;
}

function AppForm({ app }: { app?: AppRecord }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={saveAppAction} submitLabel={app ? 'Save' : 'Add app'} onSuccess={close} resetOnSuccess={!app}>
      {app && <input type="hidden" name="id" value={app.id} />}
      <FormGrid>
        <TextField label="Title" name="title" defaultValue={app?.title} />
        <TextField label="Package name" name="package_name" defaultValue={app?.package_name} placeholder="com.example.app" />
      </FormGrid>
      <FormGrid>
        <TextField label="Version" name="version" defaultValue={app?.version} placeholder="1.4.0" />
        <TextField label="Version code" name="version_code" type="number" min="1" defaultValue={app ? String(app.version_code) : '1'} hint="Must increase with every release." />
      </FormGrid>
      <TextArea label="Description" name="description" rows={2} defaultValue={app?.description ?? ''} optional />
      <TextArea label="Release notes" name="release_notes" rows={3} defaultValue={app?.release_notes ?? ''} optional />
      <div className={ui.field}>
        <label className={ui.label} htmlFor="apk-file">APK file {app?.apk_filename ? `(current: ${app.apk_filename})` : ''}</label>
        <input id="apk-file" name="apk" type="file" accept=".apk" className={ui.control} />
      </div>
      <TextField label="…or APK download link" name="apk_url" defaultValue={app?.apk_url ?? ''} optional placeholder="https://…" />
      <FormGrid>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="icon-file">Icon (PNG, JPEG or WebP)</label>
          <input id="icon-file" name="icon" type="file" accept="image/png,image/jpeg,image/webp" className={ui.control} />
        </div>
        <TextField label="…or icon link" name="icon_url" defaultValue={app?.icon_url ?? ''} optional />
      </FormGrid>
      <CheckboxField label="Required update (apps must update)" name="mandatory" defaultChecked={app?.mandatory} />
      <CheckboxField label="Published" name="published" defaultChecked={app?.published} />
    </ActionForm>
  );
}

export function AppDialog({ app }: { app?: AppRecord }) {
  return (
    <Dialog title={app ? `Edit ${app.title}` : 'Add app'} trigger={app ? <><Pencil aria-hidden /> Edit</> : <><Plus aria-hidden /> Add app</>} triggerVariant={app ? 'ghost' : 'primary'} triggerSize={app ? 'small' : 'default'} wide>
      <AppForm app={app} />
    </Dialog>
  );
}
