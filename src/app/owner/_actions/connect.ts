'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { runAction } from '@/server/actions';
import { requireOwner } from '@/server/auth/guards';
import { approveRequest, cancelRequest, dispatchQueuedSms, pingConnection, requestConnection, saveEndpoint, setConnectionStatus } from '@/server/connect-app/owner';
import { siteOrigin } from '@/server/site';

const done = () => revalidatePath('/owner/connect-app');
const id = z.string().min(3).max(80);

export async function requestConnectionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { db } = await requireOwner();
    const code = await requestConnection(db, await siteOrigin(), { remote_endpoint: String(form.get('remote_endpoint') ?? ''), display_name: String(form.get('display_name') ?? '') });
    done();
    return `Request sent. Confirm pairing code ${code} in the other app.`;
  });
}

export async function approveRequestAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { db } = await requireOwner();
    await approveRequest(db, await siteOrigin(), id.parse(form.get('id')));
    done();
    return 'Connected.';
  });
}

export async function cancelRequestAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { db } = await requireOwner();
    await cancelRequest(db, id.parse(form.get('id')));
    done();
    return 'Request cancelled.';
  });
}

export async function connectionStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { db } = await requireOwner();
    const status = z.enum(['ACTIVE', 'PAUSED', 'DISCONNECTED', 'DELETED']).parse(form.get('status'));
    await setConnectionStatus(db, id.parse(form.get('id')), status);
    done();
    return 'Connection updated.';
  });
}

export async function pingConnectionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { db } = await requireOwner();
    await pingConnection(db, id.parse(form.get('id')));
    done();
    return 'The other app answered.';
  });
}

export async function dispatchSmsAction(_prev: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const { db } = await requireOwner();
    await dispatchQueuedSms(db);
    done();
    return 'Waiting SMS were sent to the gateway.';
  });
}

export async function saveEndpointAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { db } = await requireOwner();
    await saveEndpoint(db, String(form.get('endpoint') ?? '').trim());
    done();
    return 'Endpoint saved.';
  });
}
