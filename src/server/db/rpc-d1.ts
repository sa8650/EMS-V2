import type { D1PreparedStatement } from '@/types/cloudflare';
import type { D1DatabaseAdapter } from './d1';
import { TABLES, type TableName } from './schema';
import { SEED_ROWS } from './seeds';
import { DbError, type Row, type RpcName } from './types';

/**
 * D1 versions of the Postgres functions in db/postgres/migrations/0002_functions.sql.
 * Same arguments, same results, same error messages. Each operation runs as one
 * D1 batch (a single transaction); readable errors come from checks made just
 * before the batch, and guards inside the batch catch concurrent changes.
 */

const GUARD = 'ems_guard_violation';

/**
 * Aborts the surrounding batch when `condition` holds: SQLite has no RAISE outside
 * triggers, so json() is fed an invalid document only when the condition is true.
 */
function guard(db: D1DatabaseAdapter, condition: string, params: unknown[]): D1PreparedStatement {
  return db.executor.stmt(`SELECT json(CASE WHEN ${condition} THEN '${GUARD}' ELSE '0' END) AS ok`, params);
}

async function runBatch(db: D1DatabaseAdapter, statements: D1PreparedStatement[], onGuard: string): Promise<Row[][]> {
  try {
    return await db.executor.batch(statements);
  } catch (e) {
    if (/malformed JSON/i.test(e instanceof Error ? e.message : String(e))) throw new DbError(onGuard, 409, 'P0001');
    throw e;
  }
}

const fail = (message: string): never => {
  throw new DbError(message, 400, 'P0001');
};

const num = (v: unknown) => Number(v ?? 0);
const opt = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v));

interface LineArg {
  product_id: string;
  quantity: number;
  unit_price: number;
  tax_percent?: number;
  discount?: number;
  line_total: number;
}

function aggregate(lines: LineArg[]): Map<string, number> {
  const need = new Map<string, number>();
  for (const l of lines) need.set(l.product_id, (need.get(l.product_id) ?? 0) + num(l.quantity));
  return need;
}

async function postInvoice(db: D1DatabaseAdapter, args: Row): Promise<Row> {
  const inv = (args.p_invoice ?? {}) as Row;
  const lines = (Array.isArray(args.p_lines) ? args.p_lines : []) as LineArg[];
  const shop = String(inv.shop_id ?? '');
  const kind = inv.kind;
  if (kind !== 'sale' && kind !== 'purchase') fail('Invalid invoice type');
  if (!lines.length) fail('Add at least one item to the invoice');
  const x = db.executor;

  const customer = opt(inv.customer_id);
  const supplier = opt(inv.supplier_id);
  if (customer && !(await x.all('SELECT 1 FROM customers WHERE id = ? AND shop_id = ?', [customer, shop])).length) fail('Customer not found in this shop');
  if (supplier && !(await x.all('SELECT 1 FROM suppliers WHERE id = ? AND shop_id = ?', [supplier, shop])).length) fail('Supplier not found in this shop');

  const need = aggregate(lines);
  const ids = [...need.keys()];
  const products = await x.all<{ id: string; code: string; stock: number }>(
    `SELECT id, code, stock FROM products WHERE shop_id = ? AND active = 1 AND id IN (${ids.map(() => '?').join(', ')})`,
    [shop, ...ids],
  );
  if (products.length !== ids.length) fail('Item not found in this shop');
  if (kind === 'sale') {
    const short = products.find((p) => num(p.stock) < (need.get(p.id) ?? 0));
    if (short) fail(`Insufficient stock for item ${short.code}`);
  }

  const counter = `invoice:${kind}`;
  const prefix = kind === 'sale' ? 'INV-' : 'PUR-';
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (kind === 'sale') {
    for (const [pid, qty] of need) statements.push(guard(db, '(SELECT stock FROM products WHERE id = ?) < ?', [pid, qty]));
  }
  statements.push(
    x.stmt('INSERT INTO counters (scope, name, value) VALUES (?, ?, 1) ON CONFLICT (scope, name) DO UPDATE SET value = value + 1', [shop, counter]),
  );
  const invoiceIndex = statements.length;
  statements.push(
    x.stmt(
      `INSERT INTO invoices (id, shop_id, kind, number, customer_id, supplier_id, party_name, party_phone, party_address, invoice_date,
         payment_method, transaction_id, notes, subtotal, line_tax, line_discount, tax_percent, tax_amount, discount, total, paid,
         created_by, verification_token, created_at, updated_at)
       VALUES (?, ?, ?, ? || printf('%06d', (SELECT value FROM counters WHERE scope = ? AND name = ?)), ?, ?, ?, ?, ?, COALESCE(?, date('now')),
         COALESCE(?, 'cash'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [
        id, shop, kind, prefix, shop, counter, customer, supplier, opt(inv.party_name), opt(inv.party_phone), opt(inv.party_address),
        opt(inv.invoice_date), opt(inv.payment_method), opt(inv.transaction_id), opt(inv.notes), num(inv.subtotal), num(inv.line_tax),
        num(inv.line_discount), num(inv.tax_percent), num(inv.tax_amount), num(inv.discount), num(inv.total), num(inv.paid),
        opt(inv.created_by), crypto.randomUUID(), now, now,
      ],
    ),
  );
  for (const l of lines) {
    statements.push(
      x.stmt(
        `INSERT INTO invoice_lines (id, invoice_id, product_id, product_name, quantity, unit_price, tax_percent, discount, line_total)
         VALUES (?, ?, ?, (SELECT name FROM products WHERE id = ?), ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), id, l.product_id, l.product_id, num(l.quantity), num(l.unit_price), num(l.tax_percent), num(l.discount), num(l.line_total)],
      ),
    );
  }
  for (const [pid, qty] of need) {
    statements.push(x.stmt('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?', [kind === 'sale' ? -qty : qty, now, pid]));
  }
  const results = await runBatch(db, statements, 'Insufficient stock: another sale changed the stock. Please try again.');
  return x.decodeRow('invoices', results[invoiceIndex]![0]!);
}

async function deleteInvoice(db: D1DatabaseAdapter, args: Row): Promise<null> {
  const shop = String(args.p_shop_id ?? '');
  const invoiceId = String(args.p_invoice_id ?? '');
  const x = db.executor;
  const [inv] = await x.all<{ id: string; kind: string }>('SELECT id, kind FROM invoices WHERE id = ? AND shop_id = ?', [invoiceId, shop]);
  if (!inv) fail('Invoice not found');
  if ((await x.all('SELECT 1 FROM returns WHERE invoice_id = ? LIMIT 1', [invoiceId])).length) fail('This invoice has returns and cannot be deleted');
  if ((await x.all('SELECT 1 FROM exchanges WHERE invoice_id = ? LIMIT 1', [invoiceId])).length) fail('This invoice has exchanges and cannot be deleted');
  if ((await x.all('SELECT 1 FROM due_payments WHERE source_type = ? AND source_id = ? LIMIT 1', [inv!.kind, invoiceId])).length) {
    fail('Due payments were recorded for this invoice, so it cannot be deleted');
  }
  const lines = await x.all<{ product_id: string; qty: number; code: string; stock: number }>(
    `SELECT l.product_id, SUM(l.quantity) AS qty, p.code, p.stock FROM invoice_lines l JOIN products p ON p.id = l.product_id
      WHERE l.invoice_id = ? GROUP BY l.product_id, p.code, p.stock`,
    [invoiceId],
  );
  if (inv!.kind === 'purchase') {
    const short = lines.find((l) => num(l.stock) < num(l.qty));
    if (short) fail(`Stock from this purchase was already sold (item ${short.code}), so it cannot be deleted`);
  }
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    guard(db, 'EXISTS (SELECT 1 FROM returns WHERE invoice_id = ?) OR EXISTS (SELECT 1 FROM exchanges WHERE invoice_id = ?)', [invoiceId, invoiceId]),
    guard(db, 'EXISTS (SELECT 1 FROM due_payments WHERE source_type = ? AND source_id = ?)', [inv!.kind, invoiceId]),
  ];
  for (const l of lines) {
    if (inv!.kind === 'purchase') statements.push(guard(db, '(SELECT stock FROM products WHERE id = ?) < ?', [l.product_id, num(l.qty)]));
    statements.push(
      x.stmt('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?', [inv!.kind === 'sale' ? num(l.qty) : -num(l.qty), now, l.product_id]),
    );
  }
  statements.push(x.stmt('DELETE FROM invoices WHERE id = ? AND shop_id = ?', [invoiceId, shop]));
  await runBatch(db, statements, 'The invoice changed while it was being deleted. Please try again.');
  return null;
}

async function nextCounter(db: D1DatabaseAdapter, args: Row): Promise<number> {
  const [row] = await db.executor.all<{ value: number }>(
    'INSERT INTO counters (scope, name, value) VALUES (?, ?, 1) ON CONFLICT (scope, name) DO UPDATE SET value = value + 1 RETURNING value',
    [String(args.p_scope ?? ''), String(args.p_name ?? '')],
  );
  return num(row?.value);
}

/** Deletes every row (children first) and restores the seed rows. */
async function factoryReset(db: D1DatabaseAdapter): Promise<null> {
  const x = db.executor;
  const order = (Object.keys(TABLES) as TableName[]).reverse();
  const statements = order.map((t) => x.stmt(`DELETE FROM "${t}"`));
  const now = new Date().toISOString();
  for (const s of SEED_ROWS.settings) statements.push(x.stmt('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [s.key, JSON.stringify(s.value), now]));
  for (const a of SEED_ROWS.addons) statements.push(x.stmt('INSERT INTO addons (key, title, updated_at) VALUES (?, ?, ?)', [a.key, a.title, now]));
  await runBatch(db, statements, 'Factory reset failed.');
  return null;
}

export async function d1Rpc(db: D1DatabaseAdapter, name: RpcName, args: Row): Promise<unknown> {
  switch (name) {
    case 'next_counter':
      return nextCounter(db, args);
    case 'post_invoice':
      return postInvoice(db, args);
    case 'delete_invoice':
      return deleteInvoice(db, args);
    case 'factory_reset':
      return factoryReset(db);
  }
}
