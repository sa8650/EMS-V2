'use client';

import { Pencil, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Dialog, useCloseDialog } from '@/components/ui/dialog';
import { ActionForm, CheckboxField, FormGrid, TextArea, TextField } from '@/components/ui/form';
import {
  factoryResetAction, reviewAddonAction, saveAddonAction, saveCouponAction, savePageAction, savePostAction, saveSettingAction,
} from '../_actions/platform';

/** Saves one platform setting (the fields are the setting's keys). */
export function SettingForm({ settingKey, children, submitLabel = 'Save' }: { settingKey: string; children: ReactNode; submitLabel?: string }) {
  return (
    <ActionForm action={saveSettingAction} submitLabel={submitLabel}>
      <input type="hidden" name="key" value={settingKey} />
      {children}
    </ActionForm>
  );
}

export interface AddonItem {
  key: string; title: string; enabled: boolean; details: string | null; unit_price: number; min_days: number; max_days: number;
  min_limit: number; max_limit: number; image_url: string | null; url: string | null;
}

function AddonForm({ item }: { item: AddonItem }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={saveAddonAction} submitLabel="Save add-on" onSuccess={close}>
      <input type="hidden" name="key" value={item.key} />
      <TextField label="Title" name="title" defaultValue={item.title} />
      <TextArea label="Description" name="details" rows={2} defaultValue={item.details ?? ''} optional />
      <FormGrid>
        <TextField label="Price per day per unit (৳)" name="unit_price" type="number" min="0" step="0.01" defaultValue={String(item.unit_price)} />
        <TextField label="Minimum days" name="min_days" type="number" min="1" defaultValue={String(item.min_days)} />
        <TextField label="Maximum days" name="max_days" type="number" min="1" defaultValue={String(item.max_days)} />
      </FormGrid>
      {item.key !== 'truebill' && (
        <FormGrid>
          <TextField label="Minimum allowance" name="min_limit" type="number" min="0" defaultValue={String(item.min_limit)} />
          <TextField label="Maximum allowance" name="max_limit" type="number" min="0" defaultValue={String(item.max_limit)} />
        </FormGrid>
      )}
      {item.key === 'truebill' && (<><input type="hidden" name="min_limit" value="1" /><input type="hidden" name="max_limit" value="1" /></>)}
      <FormGrid>
        <TextField label="Image link" name="image_url" defaultValue={item.image_url ?? ''} optional />
        <TextField label="Learn-more link" name="url" defaultValue={item.url ?? ''} optional />
      </FormGrid>
      <CheckboxField label="Offer to administrators" name="enabled" defaultChecked={item.enabled} />
    </ActionForm>
  );
}

export function AddonDialog({ item }: { item: AddonItem }) {
  return (
    <Dialog title={`Edit ${item.title}`} trigger={<><Pencil aria-hidden /> Edit</>} triggerVariant="ghost" triggerSize="small" wide>
      <AddonForm item={item} />
    </Dialog>
  );
}

function CouponForm() {
  const close = useCloseDialog();
  return (
    <ActionForm action={saveCouponAction} submitLabel="Save coupon" onSuccess={close} resetOnSuccess>
      <FormGrid>
        <TextField label="Code" name="code" autoComplete="off" />
        <TextField label="Percent off" name="percent_off" type="number" min="1" max="100" />
        <TextField label="Expires on" name="expires_at" type="date" optional />
      </FormGrid>
      <CheckboxField label="Active" name="active" defaultChecked />
    </ActionForm>
  );
}

export function CouponDialog() {
  return (
    <Dialog title="Coupon" trigger={<><Plus aria-hidden /> New coupon</>} triggerSize="small">
      <CouponForm />
    </Dialog>
  );
}

function ReviewForm({ id, decision, summary }: { id: string; decision: 'active' | 'rejected'; summary: string }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={reviewAddonAction} submitLabel={decision === 'active' ? 'Activate' : 'Reject'} submitVariant={decision === 'active' ? 'primary' : 'danger'} onSuccess={close}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <p>{summary}</p>
      <TextArea label="Note" name="note" rows={2} optional />
    </ActionForm>
  );
}

export function ReviewAddonButtons({ id, summary }: { id: string; summary: string }) {
  return (
    <span style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
      <Dialog title="Activate add-on" trigger="Approve" triggerSize="small"><ReviewForm id={id} decision="active" summary={`${summary} Confirm the payment has been received.`} /></Dialog>
      <Dialog title="Reject request" trigger="Reject" triggerSize="small" triggerVariant="ghost"><ReviewForm id={id} decision="rejected" summary={summary} /></Dialog>
    </span>
  );
}

export function PageForm({ slug, title, body }: { slug: string; title: string; body: string }) {
  return (
    <ActionForm action={savePageAction} submitLabel="Save page">
      <input type="hidden" name="slug" value={slug} />
      <TextField label="Title" name="title" defaultValue={title} />
      <TextArea label="Text" name="body" rows={12} defaultValue={body} optional hint="Plain text. Leave an empty line between paragraphs." />
    </ActionForm>
  );
}

export interface PostRecord { id: string; title: string; slug: string; excerpt: string | null; body: string; cover_image_url: string | null; published: boolean }

function PostForm({ post }: { post?: PostRecord }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={savePostAction} submitLabel={post ? 'Save post' : 'Create post'} onSuccess={close} resetOnSuccess={!post}>
      {post && <input type="hidden" name="id" value={post.id} />}
      <TextField label="Title" name="title" defaultValue={post?.title} />
      <FormGrid>
        <TextField label="Address (slug)" name="slug" defaultValue={post?.slug ?? ''} optional hint="Made from the title when empty." />
        <TextField label="Cover image link" name="cover_image_url" defaultValue={post?.cover_image_url ?? ''} optional />
      </FormGrid>
      <TextArea label="Summary" name="excerpt" rows={2} defaultValue={post?.excerpt ?? ''} optional />
      <TextArea label="Text" name="body" rows={12} defaultValue={post?.body ?? ''} optional hint="Plain text. Leave an empty line between paragraphs." />
      <CheckboxField label="Published" name="published" defaultChecked={post?.published} />
    </ActionForm>
  );
}

export function PostDialog({ post }: { post?: PostRecord }) {
  return (
    <Dialog title={post ? 'Edit post' : 'New post'} trigger={post ? <><Pencil aria-hidden /> Edit</> : <><Plus aria-hidden /> New post</>} triggerVariant={post ? 'ghost' : 'primary'} triggerSize={post ? 'small' : 'default'} wide>
      <PostForm post={post} />
    </Dialog>
  );
}

export function FactoryResetForm({ phrase }: { phrase: string }) {
  return (
    <ActionForm action={factoryResetAction} submitLabel="Erase everything" submitVariant="danger">
      <p>
        This permanently deletes <strong>all</strong> administrators, shops, records and settings, including your owner account. Afterwards the
        platform starts again at Setup. Download any data you need first.
      </p>
      <FormGrid>
        <TextField label="Your password" name="password" type="password" autoComplete="current-password" />
        <TextField label={`Type ${phrase}`} name="phrase" autoComplete="off" />
      </FormGrid>
    </ActionForm>
  );
}
