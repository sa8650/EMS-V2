'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/lib/action-state';
import { parseForm, runAction } from '@/server/actions';
import { shopAction } from '@/server/auth/guards';
import {
  createSalary, createStaff, deleteSalary, deleteStaff, paySalaryDue, permissionsFromForm, salarySchema, saveAttendance, setStaffActive, staffSchema,
  updateStaff,
} from '@/server/services/staff';

const uuid = z.string().uuid();
const optionalId = uuid.optional().or(z.literal('').transform(() => undefined));
const done = () => revalidatePath('/shop/staff');

export async function saveStaffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const id = optionalId.parse(form.get('id') ?? undefined);
    const ctx = await shopAction('staff', id ? 'edit' : 'add');
    const input = parseForm(staffSchema, form);
    const permissions = permissionsFromForm(form);
    if (id) await updateStaff(ctx, id, input, permissions);
    else await createStaff(ctx, input, permissions);
    done();
    return id ? 'Saved.' : `Staff added. They sign in with Shop ID ${ctx.shop.shop_code} and user ID ${input.user_id}.`;
  });
}

export async function setStaffActiveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('staff', 'edit');
    const active = form.get('active') === 'true';
    await setStaffActive(ctx, uuid.parse(form.get('id')), active);
    done();
    return active ? 'Activated.' : 'Deactivated. They can no longer sign in.';
  });
}

export async function deleteStaffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('staff', 'delete');
    await deleteStaff(ctx, uuid.parse(form.get('id')));
    done();
    return 'Deleted.';
  });
}

export async function saveAttendanceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('attendance', 'add');
    const n = await saveAttendance(ctx, String(form.get('date') ?? ''), form);
    done();
    return `Attendance saved for ${n} ${n === 1 ? 'person' : 'people'}.`;
  });
}

export async function createSalaryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('salary', 'add');
    const rec = await createSalary(ctx, parseForm(salarySchema, form));
    done();
    return rec.type === 'advance' ? 'Advance recorded.' : `Salary recorded: ${Number(rec.total).toFixed(2)}.`;
  });
}

export async function paySalaryDueAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('salary', 'add');
    await paySalaryDue(ctx, uuid.parse(form.get('id')), z.coerce.number().finite().parse(form.get('amount')));
    done();
    return 'Payment recorded.';
  });
}

export async function deleteSalaryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await shopAction('salary', 'delete');
    await deleteSalary(ctx, uuid.parse(form.get('id')));
    done();
    return 'Deleted.';
  });
}
