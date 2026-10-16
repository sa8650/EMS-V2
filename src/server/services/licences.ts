import 'server-only';
import { z } from 'zod';
import { ADDON_KEYS, type AddonKey } from '@/config/modules';
import { round2 } from '@/lib/invoice-math';
import { logActivity } from '@/server/activity';
import type { AdminContext, OwnerContext } from '@/server/auth/guards';
import type { Database, RowOf } from '@/server/db';
import { AppError, notFound } from '@/server/errors';
import { currentEntitlement, readModules, type ModuleAllowances } from '@/server/licensing';

/** Licence plans (owner), licence requests (administrators) and their review (owner). */

const limit = z.coerce.number().int().min(0).max(1_000_000);

export const planSchema = z.object({
  title: z.string().trim().min(2, 'Enter a plan name').max(80),
  duration_months: z.coerce.number().int().min(1, 'At least 1 month').max(120),
  max_shops: z.coerce.number().int().min(1, 'At least 1 shop').max(1000),
  price: z.coerce.number().finite().min(0).max(1e9).transform(round2),
  benefits: z.string().trim().max(2000).optional().transform((v) => v || null),
  payment_details: z.string().trim().max(2000).optional().transform((v) => v || null),
  active: z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean()),
  ...Object.fromEntries(ADDON_KEYS.map((k) => [`module_${k}`, k === 'truebill' ? z.preprocess((v) => (v === 'on' ? 1 : 0), z.number()) : limit.default(0)])),
});

function modulesFrom(input: Record<string, unknown>): ModuleAllowances {
  return readModules(Object.fromEntries(ADDON_KEYS.map((k) => [k, input[`module_${k}`]])));
}

export async function listPlans(db: Database) {
  return db.from('license_plans').select('*').order('active', 'desc').order('price');
}

export async function savePlan(ctx: OwnerContext, id: string | undefined, input: z.infer<typeof planSchema>) {
  const row = {
    title: input.title, duration_months: input.duration_months, max_shops: input.max_shops, price: input.price,
    benefits: input.benefits, payment_details: input.payment_details, active: input.active, modules: modulesFrom(input),
  };
  const saved = id ? (await ctx.db.from('license_plans').eq('id', id).update(row))[0] : await ctx.db.from('license_plans').insertOne(row);
  if (!saved) throw notFound('Plan');
  await logActivity(ctx.db, { actorType: 'owner', actorId: ctx.owner.id, action: id ? 'updated licence plan' : 'created licence plan', entityType: 'license_plans', entityId: saved.id, metadata: { title: saved.title } });
}

export const requestSchema = z.object({
  plan_id: z.string().uuid('Choose a plan'),
  payment_method: z.enum(['bkash', 'nagad', 'bank', 'other'], { message: 'Choose how you paid' }),
  payment_number: z.string().trim().min(3, 'Enter the number you paid from').max(40),
  transaction_id: z.string().trim().min(3, 'Enter the transaction ID').max(80),
});

export async function requestLicence(ctx: AdminContext, input: z.infer<typeof requestSchema>) {
  if (await ctx.db.from('licenses').eq('admin_id', ctx.admin.id).eq('status', 'pending').count()) {
    throw new AppError('You already have a licence request waiting for review.', 409);
  }
  const plan = await ctx.db.from('license_plans').select('*').eq('id', input.plan_id).eq('active', true).maybeSingle();
  if (!plan) throw new AppError('That plan is not available.', 400, { plan_id: 'Choose another plan' });
  const current = await currentEntitlement(ctx.db, ctx.admin.id);
  const row = await ctx.db.from('licenses').insertOne({
    admin_id: ctx.admin.id, plan_id: plan.id, kind: current ? 'renewal' : 'new', title: plan.title, duration_months: plan.duration_months,
    max_shops: plan.max_shops, modules: readModules(plan.modules), amount: plan.price,
    payment_method: input.payment_method, payment_number: input.payment_number, transaction_id: input.transaction_id,
  });
  await logActivity(ctx.db, { adminId: ctx.admin.id, actorType: 'admin', actorId: ctx.admin.id, action: 'requested licence', entityType: 'licenses', entityId: row.id, metadata: { title: plan.title, amount: plan.price } });
  return row;
}

export async function adminLicences(db: Database, adminId: string) {
  return db.from('licenses').select('*').eq('admin_id', adminId).order('created_at', 'desc').limit(50);
}

export async function ownerLicences(db: Database, opts: { status?: string; page?: number }) {
  const page = opts.page ?? 1;
  const base = () => (opts.status ? db.from('licenses').eq('status', opts.status) : db.from('licenses'));
  const [rows, total] = await Promise.all([
    base().select('*,admins(name,email,admin_code)').order('created_at', 'desc').limit(25).offset((page - 1) * 25),
    base().count(),
  ]);
  return { rows: rows as (RowOf<'licenses'> & { admins: { name: string; email: string; admin_code: string } | null })[], total, page };
}

const addMonths = (d: Date, months: number) => {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + months);
  return x;
};

const modulesGrow = (next: ModuleAllowances, prev: ModuleAllowances) => ADDON_KEYS.some((k: AddonKey) => (next[k] ?? 0) > (prev[k] ?? 0));

/**
 * Approves (activates) or rejects a pending request. A request for the current
 * plan renews it (starting when it ends); more shops or add-ons is an upgrade
 * and anything else a downgrade, both starting now and replacing the current licence.
 */
export async function reviewLicence(ctx: OwnerContext, id: string, decision: 'active' | 'rejected', note: string | null) {
  const lic = await ctx.db.from('licenses').select('*').eq('id', id).maybeSingle();
  if (!lic) throw notFound('Licence request');
  if (lic.status !== 'pending') throw new AppError('This request has already been reviewed.', 409);
  const reviewed = { reviewed_at: new Date().toISOString(), reviewed_by: ctx.owner.id, review_note: note };
  if (decision === 'rejected') {
    await ctx.db.from('licenses').eq('id', id).update({ ...reviewed, status: 'rejected' });
  } else {
    const now = new Date();
    const current = await currentEntitlement(ctx.db, lic.admin_id);
    let kind: RowOf<'licenses'>['kind'] = 'new';
    let starts = now;
    if (current) {
      const currentLicence = await ctx.db.from('licenses').select('plan_id').eq('id', current.licenseId).maybeSingle();
      if (currentLicence?.plan_id && currentLicence.plan_id === lic.plan_id) {
        kind = 'renewal';
        starts = new Date(current.expiresAt) > now ? new Date(current.expiresAt) : now;
      } else {
        kind = lic.max_shops > current.maxShops || modulesGrow(readModules(lic.modules), current.modules) ? 'upgrade' : 'downgrade';
      }
    }
    if (kind !== 'renewal') {
      // The new licence replaces whatever is active now.
      await ctx.db.from('licenses').eq('admin_id', lic.admin_id).eq('status', 'active').update({ status: 'expired' });
    }
    await ctx.db.from('licenses').eq('id', id).update({
      ...reviewed, status: 'active', kind, starts_at: starts.toISOString(), expires_at: addMonths(starts, lic.duration_months).toISOString(),
    });
  }
  await logActivity(ctx.db, { adminId: lic.admin_id, actorType: 'owner', actorId: ctx.owner.id, action: decision === 'active' ? 'approved licence' : 'rejected licence', entityType: 'licenses', entityId: id, metadata: { title: lic.title } });
}
