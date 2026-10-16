import 'server-only';
import { z } from 'zod';
import { round2 } from '@/lib/invoice-math';
import { isYmd, monthRange } from '@/lib/dates';
import { PERMISSION_SECTIONS, SECTION_VERBS, normalizePermissions, type PermissionMap } from '@/lib/permissions';
import { logActivity } from '@/server/activity';
import { hashPassword } from '@/server/auth/crypto';
import type { ShopContext } from '@/server/auth/guards';
import type { Database, RowOf } from '@/server/db';
import { DbError } from '@/server/db';
import { AppError, notFound } from '@/server/errors';

/** Staff accounts and permissions, daily attendance and salary payments. */

const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const money = z.coerce.number().finite().min(0, 'Cannot be negative').max(1e10).transform(round2);
const log = (ctx: ShopContext, action: string, id: string, metadata: Record<string, unknown> = {}) =>
  logActivity(ctx.db, { shopId: ctx.shop.id, actorType: ctx.actor.type, actorId: ctx.actor.id, action, entityType: 'staff', entityId: id, metadata });

export const staffSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter a name').max(80),
  user_id: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, '3–40 characters: letters, numbers, . _ -'),
  password: z.string().max(200).optional().transform((v) => v || undefined).refine((v) => !v || v.length >= 8, 'Use at least 8 characters'),
  position: optional(60),
  phone: optional(30),
  email: z.string().trim().toLowerCase().max(120).optional().transform((v) => v || null).refine((v) => !v || z.string().email().safeParse(v).success, 'Enter a valid email'),
  basic_salary: money.default(0),
});

/** Permission checkboxes are posted as `perm` values like "sales:add". */
export function permissionsFromForm(form: FormData): PermissionMap {
  const map: Record<string, string[]> = {};
  for (const v of form.getAll('perm')) {
    const [section, verb] = String(v).split(':');
    if (section && verb) (map[section] ??= []).push(verb);
  }
  return normalizePermissions(map);
}

export const PERMISSION_GRID = PERMISSION_SECTIONS.filter((s) => s !== 'dashboard').map((section) => ({ section, verbs: SECTION_VERBS[section] }));

export async function listStaff(db: Database, shopId: string) {
  return db.from('staff').select('id,full_name,user_id,position,phone,email,basic_salary,permissions,active,created_at').eq('shop_id', shopId).order('full_name');
}

function uniqueUser(e: unknown): never {
  if (e instanceof DbError && e.code === '23505') throw new AppError('That user ID is already used in this shop.', 409, { user_id: 'Choose another user ID' });
  throw e;
}

export async function createStaff(ctx: ShopContext, input: z.infer<typeof staffSchema>, permissions: PermissionMap) {
  if (!input.password) throw new AppError('Set a password for the new staff member.', 400, { password: 'Required for new staff' });
  const { password, ...rest } = input;
  const row = await ctx.db.from('staff').insertOne({ ...rest, shop_id: ctx.shop.id, password_hash: await hashPassword(password), permissions }).catch(uniqueUser);
  await log(ctx, 'created staff', row.id, { user_id: row.user_id });
  return row;
}

export async function updateStaff(ctx: ShopContext, id: string, input: z.infer<typeof staffSchema>, permissions: PermissionMap) {
  const { password, ...rest } = input;
  const patch = { ...rest, permissions, ...(password ? { password_hash: await hashPassword(password) } : {}) };
  const [row] = await ctx.db.from('staff').eq('id', id).eq('shop_id', ctx.shop.id).update(patch).catch(uniqueUser);
  if (!row) throw notFound('Staff member');
  await log(ctx, password ? 'updated staff and password' : 'updated staff', id, { user_id: row.user_id });
}

export async function setStaffActive(ctx: ShopContext, id: string, active: boolean) {
  const [row] = await ctx.db.from('staff').eq('id', id).eq('shop_id', ctx.shop.id).update({ active });
  if (!row) throw notFound('Staff member');
  await log(ctx, active ? 'activated staff' : 'deactivated staff', id, { user_id: row.user_id });
}

export async function deleteStaff(ctx: ShopContext, id: string) {
  const [row] = await ctx.db.from('staff').eq('id', id).eq('shop_id', ctx.shop.id).delete();
  if (!row) throw notFound('Staff member');
  await log(ctx, 'deleted staff', id, { user_id: row.user_id, name: row.full_name });
}

/* ───────────────────────────── attendance ───────────────────────────── */

export async function attendanceForDay(db: Database, shopId: string, date: string) {
  const [staff, marks] = await Promise.all([
    db.from('staff').select('id,full_name,position').eq('shop_id', shopId).eq('active', true).order('full_name'),
    db.from('attendance').select('staff_id,status,note').eq('shop_id', shopId).eq('date', date),
  ]);
  const byStaff = new Map(marks.map((m) => [m.staff_id, m]));
  return staff.map((s) => ({ ...s, status: (byStaff.get(s.id)?.status ?? null) as 'present' | 'absent' | null, note: byStaff.get(s.id)?.note ?? null }));
}

export async function saveAttendance(ctx: ShopContext, date: string, form: FormData) {
  if (!isYmd(date)) throw new AppError('Pick a valid date.', 400);
  const staff = await ctx.db.from('staff').select('id').eq('shop_id', ctx.shop.id).eq('active', true);
  const rows = staff
    .map((s) => ({ staff_id: s.id, status: String(form.get(`status:${s.id}`) ?? '') }))
    .filter((r) => r.status === 'present' || r.status === 'absent')
    .map((r) => ({ ...r, shop_id: ctx.shop.id, date, recorded_by: ctx.actor.id }));
  if (!rows.length) throw new AppError('Mark at least one person present or absent.', 400);
  await ctx.db.from('attendance').upsert(rows, { onConflict: 'staff_id,date' });
  await logActivity(ctx.db, { shopId: ctx.shop.id, actorType: ctx.actor.type, actorId: ctx.actor.id, action: 'recorded attendance', entityType: 'attendance', metadata: { date, count: rows.length } });
  return rows.length;
}

/** Present days per staff member in a month (YYYY-MM). */
export async function monthAttendance(db: Database, shopId: string, month: string) {
  const { from, to } = monthRange(`${month}-01`);
  const rows = await db.from('attendance').select('staff_id,status').eq('shop_id', shopId).gte('date', from).lte('date', to);
  const out = new Map<string, { present: number; absent: number }>();
  for (const r of rows) {
    const e = out.get(r.staff_id) ?? { present: 0, absent: 0 };
    if (r.status === 'present') e.present++;
    else e.absent++;
    out.set(r.staff_id, e);
  }
  return { days: Number(to.slice(8)), byStaff: out };
}

/* ───────────────────────────── salary ───────────────────────────── */

export interface SalaryBalance {
  advanceBalance: number;
  outstanding: number;
  paidThisYear: number;
}

export async function salaryBalances(db: Database, shopId: string): Promise<Map<string, SalaryBalance>> {
  const rows = await db.from('salary_payments').select('staff_id,type,total,paid,due,advance_deducted,created_at').eq('shop_id', shopId).limit(10000);
  const year = new Date().getUTCFullYear();
  const out = new Map<string, SalaryBalance>();
  for (const r of rows) {
    const b = out.get(r.staff_id) ?? { advanceBalance: 0, outstanding: 0, paidThisYear: 0 };
    if (r.type === 'advance') b.advanceBalance = round2(b.advanceBalance + Number(r.total));
    else b.advanceBalance = round2(b.advanceBalance - Number(r.advance_deducted));
    b.outstanding = round2(b.outstanding + Number(r.due));
    if (new Date(r.created_at).getUTCFullYear() === year) b.paidThisYear = round2(b.paidThisYear + Number(r.paid));
    out.set(r.staff_id, b);
  }
  return out;
}

export const salarySchema = z.object({
  staff_id: z.string().uuid(),
  type: z.enum(['salary', 'advance']),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Pick a month'),
  base_amount: money.default(0),
  attendance_based: z.preprocess((v) => v === 'on' || v === true, z.boolean()).default(false),
  present_days: z.coerce.number().int().min(0).max(31).default(0),
  total_days: z.coerce.number().int().min(0).max(31).default(0),
  incentive: money.default(0),
  bonus: money.default(0),
  fine: money.default(0),
  other_deduction: money.default(0),
  advance_deducted: money.default(0),
  paid: money.default(0),
  note: optional(500),
});

/**
 * A salary payment: base (or base × present/total days) + incentive + bonus −
 * fine − other deductions − advance repaid. An advance is money paid ahead,
 * repaid later through `advance_deducted`, which can never exceed what is open.
 */
export async function createSalary(ctx: ShopContext, input: z.infer<typeof salarySchema>) {
  const person = await ctx.db.from('staff').select('id,full_name').eq('id', input.staff_id).eq('shop_id', ctx.shop.id).maybeSingle();
  if (!person) throw notFound('Staff member');
  let row: Partial<RowOf<'salary_payments'>>;
  if (input.type === 'advance') {
    if (input.paid <= 0) throw new AppError('Enter the advance amount.', 400, { paid: 'Enter an amount' });
    row = { type: 'advance', total: input.paid, paid: input.paid };
  } else {
    const balance = (await salaryBalances(ctx.db, ctx.shop.id)).get(person.id)?.advanceBalance ?? 0;
    if (input.advance_deducted > balance) throw new AppError(`Only ${balance.toFixed(2)} of advances is open.`, 400, { advance_deducted: `At most ${balance.toFixed(2)}` });
    if (input.attendance_based && (!input.total_days || input.present_days > input.total_days)) throw new AppError('Check the present and total days.', 400, { present_days: 'Present days must be between 0 and total days' });
    const base = input.attendance_based ? round2((input.base_amount * input.present_days) / input.total_days) : input.base_amount;
    const total = Math.max(0, round2(base + input.incentive + input.bonus - input.fine - input.other_deduction - input.advance_deducted));
    if (input.paid > total) throw new AppError('Paid cannot be more than the total.', 400, { paid: `At most ${total.toFixed(2)}` });
    row = {
      type: 'salary', base_amount: input.base_amount, attendance_based: input.attendance_based, present_days: input.present_days, total_days: input.total_days,
      incentive: input.incentive, bonus: input.bonus, fine: input.fine, other_deduction: input.other_deduction, advance_deducted: input.advance_deducted, total, paid: input.paid,
    };
  }
  const saved = await ctx.db.from('salary_payments').insertOne({ ...row, shop_id: ctx.shop.id, staff_id: person.id, month: input.month, note: input.note, created_by: ctx.actor.id });
  await logActivity(ctx.db, { shopId: ctx.shop.id, actorType: ctx.actor.type, actorId: ctx.actor.id, action: input.type === 'advance' ? 'paid salary advance' : 'paid salary', entityType: 'salary_payments', entityId: saved.id, metadata: { staff: person.full_name, month: input.month, total: saved.total } });
  return saved;
}

export async function paySalaryDue(ctx: ShopContext, id: string, amount: number) {
  const rec = await ctx.db.from('salary_payments').select('id,paid,due').eq('id', id).eq('shop_id', ctx.shop.id).maybeSingle();
  if (!rec) throw notFound('Salary payment');
  if (amount <= 0 || amount > Number(rec.due)) throw new AppError(`Enter an amount up to ${Number(rec.due).toFixed(2)}.`, 400, { amount: 'Too high' });
  const updated = await ctx.db.from('salary_payments').eq('id', id).eq('shop_id', ctx.shop.id).eq('paid', Number(rec.paid)).update({ paid: round2(Number(rec.paid) + amount) });
  if (!updated.length) throw new AppError('This payment was just changed. Please try again.', 409);
}

export async function deleteSalary(ctx: ShopContext, id: string) {
  const [row] = await ctx.db.from('salary_payments').eq('id', id).eq('shop_id', ctx.shop.id).delete();
  if (!row) throw notFound('Salary payment');
  await logActivity(ctx.db, { shopId: ctx.shop.id, actorType: ctx.actor.type, actorId: ctx.actor.id, action: 'deleted salary payment', entityType: 'salary_payments', entityId: id, metadata: { month: row.month, total: row.total } });
}

export async function salaryHistory(db: Database, shopId: string, staffId?: string) {
  const q = db.from('salary_payments').select('*,staff(full_name)').eq('shop_id', shopId).order('created_at', 'desc').limit(100);
  return (staffId ? q.eq('staff_id', staffId) : q) as unknown as Promise<(RowOf<'salary_payments'> & { staff: { full_name: string } | null })[]>;
}

