import { describe, expect, it } from 'vitest';
import { allPermissions } from '@/lib/permissions';
import type { ShopContext } from '@/server/auth/guards';
import type { Database } from '@/server/db';
import { AppError } from '@/server/errors';
import { recordPayment, receivables } from '@/server/services/dues';
import { deleteInvoice, invoiceSchema, postInvoice } from '@/server/services/invoices';
import { createParty, createProduct, deleteParty } from '@/server/services/records';
import { createExchange, createReturn, exchangeSchema, quarantine, returnableInvoice, returnSchema } from '@/server/services/returns';
import { DbError } from '@/server/db/types';
import { providerCases } from '../helpers/providers';

async function shopContext(db: Database): Promise<ShopContext> {
  const admin = await db.from('admins').insertOne({ admin_code: '3001', name: 'Admin', email: 'a@example.com', phone: '0170', password_hash: 'x' });
  const shop = await db.from('shops').insertOne({ admin_id: admin.id, shop_code: '4001', name: 'Shop' });
  return { db, session: { role: 'admin', id: admin.id, shopId: shop.id, exp: 0 }, shop, actor: { type: 'admin', id: admin.id, name: 'Admin' }, permissions: allPermissions(), readOnly: false, entitlement: null };
}

const form = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
const stock = async (db: Database, id: string) => Number((await db.from('products').select('stock').eq('id', id).single()).stock);

async function setup(db: Database) {
  const ctx = await shopContext(db);
  const phone = await createProduct(ctx, { name: 'Phone X', category: null, unit: 'pcs', sale_price: 1000 });
  const case_ = await createProduct(ctx, { name: 'Case', category: null, unit: 'pcs', sale_price: 200 });
  const customer = await createParty(ctx, 'customers', { name: 'Karim', phone: '0181', phone2: null, email: null, address: null });
  await postInvoice(ctx, invoiceSchema.parse(form({ kind: 'purchase', lines: [{ product_id: phone.id, quantity: 10, unit_price: 700 }, { product_id: case_.id, quantity: 20, unit_price: 50 }], paid: '0' })));
  const sale = await postInvoice(ctx, invoiceSchema.parse(form({ kind: 'sale', party_id: customer.id, tax_percent: '0', lines: [{ product_id: phone.id, quantity: 4, unit_price: 1000, tax_percent: 5, discount: 40 }], paid: '1000' })));
  return { ctx, phone, case_, customer, sale };
}

async function appError(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError || e instanceof DbError) return e;
    throw e;
  }
  throw new Error('expected an error');
}

for (const provider of providerCases()) {
  describe(`shop flows: ${provider.name}`, () => {
    it('snapshots the customer on the invoice and blocks deleting customers with invoices', async () => {
      const db = await provider.make();
      const { ctx, customer, sale } = await setup(db);
      expect(sale.party_name).toBe('Karim');
      expect(sale.number).toBe('INV-000001');
      expect(Number(sale.total)).toBe(4160); // 4 × 1000 + 5% VAT (200) − 40 discount
      expect((await appError(deleteParty(ctx, 'customers', customer.id))).message).toContain('has 1 invoice');
    });

    it('returns: sellable goes back to stock, damaged is quarantined, quantities are capped', async () => {
      const db = await provider.make();
      const { ctx, phone, sale } = await setup(db);
      expect(await stock(db, phone.id)).toBe(6);
      const { lines } = await returnableInvoice(db, ctx.shop.id, sale.id);
      const line = lines[0]!;
      const ret = await createReturn(ctx, returnSchema.parse(form({
        invoice_id: sale.id, refund_method: 'cash',
        items: [{ invoice_line_id: line.id, quantity: 1, reason: 'changed_mind', condition: 'sellable' }, { invoice_line_id: line.id, quantity: 1, reason: 'damaged', condition: 'damaged', penalty: 50 }],
      })));
      expect(ret.number).toBe('RET-000001');
      expect(Number(ret.total)).toBe(2030); // 2 × (1000 + 50 VAT − 10 discount share) − 50 penalty on one unit
      expect(ret.status).toBe('refunded');
      expect(await stock(db, phone.id)).toBe(7); // only the sellable unit is back
      expect((await quarantine(db, ctx.shop.id)).length).toBe(1);
      expect((await returnableInvoice(db, ctx.shop.id, sale.id)).lines[0]!.returnable).toBe(2);
      expect((await appError(createReturn(ctx, returnSchema.parse(form({ invoice_id: sale.id, items: [{ invoice_line_id: line.id, quantity: 3, reason: 'other', reason_note: 'x', condition: 'sellable' }] }))))).message).toContain('Only 2');
      expect(() => returnSchema.parse(form({ invoice_id: sale.id, items: [{ invoice_line_id: line.id, quantity: 1, reason: 'other', condition: 'sellable' }] }))).toThrow(/note/);
      expect((await appError(deleteInvoice(ctx, sale.id, 'sale'))).message).toContain('has returns');
    });

    it('exchanges: returned and replacement stock move, the difference is settled', async () => {
      const db = await provider.make();
      const { ctx, phone, case_, sale } = await setup(db);
      const { lines } = await returnableInvoice(db, ctx.shop.id, sale.id);
      const ex = await createExchange(ctx, exchangeSchema.parse(form({
        invoice_id: sale.id, payment_method: 'cash',
        returned: [{ invoice_line_id: lines[0]!.id, quantity: 1, reason: 'wrong_product', condition: 'sellable' }],
        new_items: [{ product_id: case_.id, quantity: 2, unit_price: 200 }],
      })));
      expect(ex.number).toBe('EXC-000001');
      expect(Number(ex.returned_total)).toBe(1040);
      expect(Number(ex.difference)).toBe(-640);
      expect(ex.settlement).toBe('refund');
      expect(await stock(db, phone.id)).toBe(7);
      expect(await stock(db, case_.id)).toBe(18);
      expect((await appError(createExchange(ctx, exchangeSchema.parse(form({
        invoice_id: sale.id, returned: [{ invoice_line_id: lines[0]!.id, quantity: 1, reason: 'defective', condition: 'defective' }],
        new_items: [{ product_id: case_.id, quantity: 500, unit_price: 200 }],
      }))))).message).toContain('Insufficient stock for Case');
    });

    it('dues: collects part of a due, refuses overpayment', async () => {
      const db = await provider.make();
      const { ctx, sale } = await setup(db);
      expect((await receivables(db, ctx.shop.id)).map((r) => r.due)).toEqual([3160]);
      const r1 = await recordPayment(ctx, { source_type: 'sale', source_id: sale.id, amount: 1000, payment_method: 'bkash', transaction_id: 'T1', note: null });
      expect(r1.remaining).toBe(2160);
      expect((await appError(recordPayment(ctx, { source_type: 'sale', source_id: sale.id, amount: 5000, payment_method: 'cash', transaction_id: null, note: null }))).message).toContain('Only 2160.00 is due');
      await recordPayment(ctx, { source_type: 'sale', source_id: sale.id, amount: 2160, payment_method: 'cash', transaction_id: null, note: null });
      expect(await receivables(db, ctx.shop.id)).toEqual([]);
      expect((await appError(deleteInvoice(ctx, sale.id, 'sale'))).message).toContain('Due payments were recorded');
    });
  });
}
