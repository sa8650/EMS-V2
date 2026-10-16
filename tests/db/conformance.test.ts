import { describe, expect, it } from 'vitest';
import { computeInvoiceTotals } from '@/lib/invoice-math';
import type { Database, RowOf } from '@/server/db';
import { DbError } from '@/server/db/types';
import { providerCases } from '../helpers/providers';

/** Two tenants: shop A (the one under test) and shop B (must stay isolated). */
async function fixture(db: Database) {
  const admin = await db.from('admins').insertOne({ admin_code: '1001', name: 'Rina', email: 'rina@example.com', phone: '01700000000', password_hash: 'x' });
  const shop = await db.from('shops').insertOne({ admin_id: admin.id, shop_code: '2001', name: 'Shop A' });
  const other = await db.from('shops').insertOne({ admin_id: admin.id, shop_code: '2002', name: 'Shop B' });
  const p1 = await db.from('products').insertOne({ shop_id: shop.id, code: 'ITM-00001', name: 'Rice 5kg', unit: 'bag', sale_price: 650 });
  const p2 = await db.from('products').insertOne({ shop_id: shop.id, code: 'ITM-00002', name: 'Lentils 1kg', sale_price: 140 });
  const foreign = await db.from('products').insertOne({ shop_id: other.id, code: 'ITM-00001', name: 'Other shop item', stock: 50 });
  const customer = await db.from('customers').insertOne({ shop_id: shop.id, code: 'CUS-0001', name: 'Karim Uddin', phone: '01811111111' });
  const foreignCustomer = await db.from('customers').insertOne({ shop_id: other.id, code: 'CUS-0001', name: 'Elsewhere' });
  const supplier = await db.from('suppliers').insertOne({ shop_id: shop.id, code: 'SUP-0001', name: 'Wholesale Ltd' });
  return { admin, shop, other, p1, p2, foreign, customer, foreignCustomer, supplier };
}

function invoiceArgs(shopId: string, kind: 'sale' | 'purchase', lines: { product: RowOf<'products'>; quantity: number; unitPrice: number }[], extra: Record<string, unknown> = {}) {
  const t = computeInvoiceTotals(lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })), { paid: extra.paid as number | undefined });
  return {
    p_invoice: {
      shop_id: shopId, kind, subtotal: t.subtotal, line_tax: t.lineTaxAmount, line_discount: t.lineDiscountAmount, tax_percent: t.taxPercent,
      tax_amount: t.taxAmount, discount: t.discount, total: t.total, paid: t.paid, ...extra,
    },
    p_lines: lines.map((l, i) => ({ product_id: l.product.id, quantity: l.quantity, unit_price: l.unitPrice, line_total: t.lines[i]!.total })),
  };
}

const stockOf = async (db: Database, id: string) => Number((await db.from('products').select('stock').eq('id', id).single()).stock);

async function rejects(p: Promise<unknown>): Promise<DbError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof DbError) return e;
    throw e;
  }
  throw new Error('expected the operation to fail');
}

for (const provider of providerCases()) {
  describe(`database conformance: ${provider.name}`, () => {
    it('round-trips booleans, JSON, numbers and generated columns', async () => {
      const db = await provider.make();
      const { shop, customer } = await fixture(db);
      const staff = await db.from('staff').insertOne({
        shop_id: shop.id, user_id: 'cashier', full_name: 'Cashier', password_hash: 'x', permissions: { sales: ['view', 'add'] }, basic_salary: 12000.5,
      });
      expect(staff.active).toBe(true);
      expect(staff.permissions).toEqual({ sales: ['view', 'add'] });
      expect(Number(staff.basic_salary)).toBe(12000.5);
      const [off] = await db.from('staff').eq('id', staff.id).update({ active: false });
      expect(off!.active).toBe(false);
      expect(await db.from('staff').eq('shop_id', shop.id).eq('active', false).count()).toBe(1);
      const exp = await db.from('expenses').insertOne({ shop_id: shop.id, code: 'EXP-0001', details: 'Rent', total: 5000, paid: 1500 });
      expect(Number(exp.due)).toBe(3500);
      expect(customer.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('searches, counts, orders and pages within one shop', async () => {
      const db = await provider.make();
      const { shop } = await fixture(db);
      for (const [i, name] of ['Abdul Hamid', 'Nasrin Akter', 'Hamida Begum', 'Jamal'].entries()) {
        await db.from('customers').insert({ shop_id: shop.id, code: `CUS-10${i}`, name, phone: `0190000000${i}` });
      }
      const hits = await db.from('customers').select('name').eq('shop_id', shop.id).search(['name', 'phone'], 'hami').order('name');
      expect(hits.map((h) => h.name)).toEqual(['Abdul Hamid', 'Hamida Begum']);
      expect(await db.from('customers').eq('shop_id', shop.id).search(['phone'], '01900000003').count()).toBe(1);
      const page = await db.from('customers').select('name').eq('shop_id', shop.id).order('name').limit(2).offset(2);
      expect(page.map((p) => p.name)).toEqual(['Jamal', 'Karim Uddin']);
    });

    it('maps constraint violations to the same errors', async () => {
      const db = await provider.make();
      const { admin, shop, p1 } = await fixture(db);
      expect((await rejects(db.from('shops').insert({ admin_id: admin.id, shop_code: '2001', name: 'Dup' }))).status).toBe(409);
      expect((await rejects(db.from('products').eq('id', p1.id).update({ stock: -1 }))).status).toBe(400);
      expect((await rejects(db.from('customers').insert({ shop_id: '00000000-0000-4000-8000-000000000000', code: 'X', name: 'Y' }))).status).toBe(409);
      expect((await rejects(db.from('customers').insert({ shop_id: shop.id, code: 'CUS-0001', name: 'Duplicate code' }))).status).toBe(409);
    });

    it('allocates counters per scope', async () => {
      const db = await provider.make();
      const next = (scope: string) => db.rpc<number>('next_counter', { p_scope: scope, p_name: 'customer' });
      expect([await next('a'), await next('a'), await next('b'), await next('a')].map(Number)).toEqual([1, 2, 1, 3]);
    });

    it('posts purchase and sale invoices atomically with numbering and stock', async () => {
      const db = await provider.make();
      const { shop, p1, p2, customer, supplier } = await fixture(db);
      const pur = await db.rpc<RowOf<'invoices'>>('post_invoice', invoiceArgs(shop.id, 'purchase', [{ product: p1, quantity: 10, unitPrice: 500 }, { product: p2, quantity: 4, unitPrice: 100 }], { supplier_id: supplier.id }));
      expect(pur.number).toBe('PUR-000001');
      expect(await stockOf(db, p1.id)).toBe(10);
      const sale = await db.rpc<RowOf<'invoices'>>('post_invoice', invoiceArgs(shop.id, 'sale', [{ product: p1, quantity: 3, unitPrice: 650 }], { customer_id: customer.id, paid: 1000 }));
      expect(sale.number).toBe('INV-000001');
      expect(Number(sale.total)).toBe(1950);
      expect(Number(sale.due)).toBe(950);
      expect(await stockOf(db, p1.id)).toBe(7);
      const second = await db.rpc<RowOf<'invoices'>>('post_invoice', invoiceArgs(shop.id, 'sale', [{ product: p1, quantity: 1, unitPrice: 650 }, { product: p1, quantity: 1, unitPrice: 650 }]));
      expect(second.number).toBe('INV-000002');
      expect(await stockOf(db, p1.id)).toBe(5);

      const full = await db.from('invoices').select('number,customers(name),invoice_lines(product_name,quantity,products(code))').eq('id', sale.id).single();
      expect(full).toMatchObject({ number: 'INV-000001', customers: { name: 'Karim Uddin' } });
      expect((full as unknown as { invoice_lines: { product_name: string; products: { code: string } }[] }).invoice_lines[0]).toMatchObject({
        product_name: 'Rice 5kg', products: { code: 'ITM-00001' },
      });
    });

    it('rejects overselling and cross-shop records without side effects', async () => {
      const db = await provider.make();
      const { shop, p1, foreign, foreignCustomer } = await fixture(db);
      await db.rpc('post_invoice', invoiceArgs(shop.id, 'purchase', [{ product: p1, quantity: 2, unitPrice: 500 }]));
      expect((await rejects(db.rpc('post_invoice', invoiceArgs(shop.id, 'sale', [{ product: p1, quantity: 2, unitPrice: 650 }, { product: p1, quantity: 1, unitPrice: 650 }])))).message).toContain('Insufficient stock for item ITM-00001');
      expect((await rejects(db.rpc('post_invoice', invoiceArgs(shop.id, 'sale', [{ product: foreign, quantity: 1, unitPrice: 1 }])))).message).toContain('Item not found in this shop');
      expect((await rejects(db.rpc('post_invoice', invoiceArgs(shop.id, 'sale', [{ product: p1, quantity: 1, unitPrice: 1 }], { customer_id: foreignCustomer.id })))).message).toContain('Customer not found in this shop');
      expect(await stockOf(db, p1.id)).toBe(2);
      expect(await stockOf(db, foreign.id)).toBe(50);
      expect(await db.from('invoices').eq('shop_id', shop.id).eq('kind', 'sale').count()).toBe(0);
      const next = await db.rpc<RowOf<'invoices'>>('post_invoice', invoiceArgs(shop.id, 'sale', [{ product: p1, quantity: 1, unitPrice: 650 }]));
      expect(next.number).toBe('INV-000001'); // failed attempts did not consume numbers
    });

    it('deletes invoices with stock reversal and guards', async () => {
      const db = await provider.make();
      const { shop, other, p1 } = await fixture(db);
      const pur = await db.rpc<RowOf<'invoices'>>('post_invoice', invoiceArgs(shop.id, 'purchase', [{ product: p1, quantity: 5, unitPrice: 500 }]));
      const sale = await db.rpc<RowOf<'invoices'>>('post_invoice', invoiceArgs(shop.id, 'sale', [{ product: p1, quantity: 4, unitPrice: 650 }]));
      expect((await rejects(db.rpc('delete_invoice', { p_shop_id: shop.id, p_invoice_id: pur.id }))).message).toContain('already sold (item ITM-00001)');
      expect((await rejects(db.rpc('delete_invoice', { p_shop_id: other.id, p_invoice_id: sale.id }))).message).toContain('Invoice not found');
      await db.from('due_payments').insert({ shop_id: shop.id, source_type: 'sale', source_id: sale.id, amount: 100 });
      expect((await rejects(db.rpc('delete_invoice', { p_shop_id: shop.id, p_invoice_id: sale.id }))).message).toContain('Due payments were recorded');
      await db.from('due_payments').eq('source_id', sale.id).delete();
      await db.rpc('delete_invoice', { p_shop_id: shop.id, p_invoice_id: sale.id });
      expect(await stockOf(db, p1.id)).toBe(5);
      expect(await db.from('invoice_lines').eq('invoice_id', sale.id).count()).toBe(0);
      await db.rpc('delete_invoice', { p_shop_id: shop.id, p_invoice_id: pur.id });
      expect(await stockOf(db, p1.id)).toBe(0);
    });

    it('factory reset removes every record and restores the seed rows', async () => {
      const db = await provider.make();
      await fixture(db);
      await db.from('settings').upsert({ key: 'branding', value: { product_name: 'X' } }, { onConflict: 'key' });
      await db.rpc('factory_reset');
      expect(await db.from('admins').count()).toBe(0);
      expect(await db.from('products').count()).toBe(0);
      expect((await db.from('settings').select('key')).map((s) => s.key)).toEqual(['schema']);
      expect(await db.from('addons').count()).toBe(5);
    });
  });
}
