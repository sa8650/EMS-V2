/**
 * Canonical invoice arithmetic shared by every database provider.
 *
 * PostgreSQL implements the same rules in `post_invoice()`
 * (db/postgres/migrations/0002_ems5_consistency.sql); the D1 adapter calls
 * this module. Keep both in sync — tests/db/invoice-math.test.ts covers it.
 *
 *   line subtotal = round2(quantity × unit price)
 *   line VAT      = round2(line subtotal × VAT% / 100)
 *   line total    = line subtotal + line VAT − round2(line discount)
 *   invoice VAT   = round2(Σ line subtotal × invoice VAT% / 100)
 *   total         = Σ subtotal + invoice VAT + Σ line VAT − discount − Σ line discount
 *   due           = total − paid
 */

/** Rounds half away from zero to 2 decimals (PostgreSQL `round(numeric, 2)` semantics). */
export function round2(input: unknown): number {
  const v = Number(input);
  if (!Number.isFinite(v) || v === 0) return 0;
  const abs = Math.abs(v);
  const text = String(abs);
  const r = text.includes('e') ? Math.round(abs * 100) / 100 : Number(`${Math.round(Number(`${text}e2`))}e-2`);
  return v < 0 ? -r : r;
}

export class InvoiceRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvoiceRuleError';
  }
}

export interface InvoiceLineInput {
  quantity: number | string;
  unitPrice: number | string;
  taxPercent?: number | string | null;
  discount?: number | string | null;
  /** Used only for error messages. */
  label?: string;
}

export interface InvoiceLineTotals {
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
}

export interface InvoiceTotals {
  lines: InvoiceLineTotals[];
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  lineTaxAmount: number;
  discount: number;
  lineDiscountAmount: number;
  total: number;
  paid: number;
  totalDue: number;
}

export function computeInvoiceTotals(
  lines: readonly InvoiceLineInput[],
  header: { taxPercent?: number | string | null; discount?: number | string | null; paid?: number | string | null },
): InvoiceTotals {
  if (!lines.length) throw new InvoiceRuleError('Invoice type and at least one line are required');
  const out: InvoiceLineTotals[] = [];
  let subtotal = 0;
  let lineTax = 0;
  let lineDisc = 0;
  for (const ln of lines) {
    const quantity = Number(ln.quantity);
    const unitPrice = Number(ln.unitPrice);
    const taxPercent = Number(ln.taxPercent ?? 0);
    const discount = round2(ln.discount ?? 0);
    if (!(quantity > 0) || !(unitPrice >= 0) || !(taxPercent >= 0) || !(discount >= 0)) {
      throw new InvoiceRuleError('Invalid item quantity, price, VAT, or discount');
    }
    const sub = round2(quantity * unitPrice);
    const tax = round2((sub * taxPercent) / 100);
    if (discount > sub + tax) throw new InvoiceRuleError(`Item discount cannot exceed the item total for ${ln.label ?? 'item'}`);
    out.push({ quantity, unitPrice, taxPercent, subtotal: sub, tax, discount, total: round2(sub + tax - discount) });
    subtotal = round2(subtotal + sub);
    lineTax = round2(lineTax + tax);
    lineDisc = round2(lineDisc + discount);
  }
  const taxPercent = Number(header.taxPercent ?? 0) || 0;
  const discount = round2(header.discount ?? 0);
  const paid = round2(header.paid ?? 0);
  const taxAmount = round2((subtotal * taxPercent) / 100);
  const total = round2(subtotal + taxAmount + lineTax - discount - lineDisc);
  if (paid > total) throw new InvoiceRuleError('Paid amount cannot exceed invoice total');
  return {
    lines: out,
    subtotal,
    taxPercent,
    taxAmount,
    lineTaxAmount: lineTax,
    discount,
    lineDiscountAmount: lineDisc,
    total,
    paid,
    totalDue: round2(total - paid),
  };
}

/**
 * Value of `quantity` units of a sold line coming back (returns and exchanges):
 * price + the line's VAT (or the invoice VAT when the line has none) − the
 * proportional share of the line discount.
 */
export function returnedLineValue(
  line: { quantity: number | string; unitPrice: number | string; taxPercent: number | string; discount: number | string },
  invoiceTaxPercent: number | string,
  quantity: number,
) {
  const unitPrice = Number(line.unitPrice);
  const sub = round2(quantity * unitPrice);
  const taxPct = Number(line.taxPercent) || Number(invoiceTaxPercent) || 0;
  const tax = round2((sub * taxPct) / 100);
  const sold = Number(line.quantity);
  const disc = sold > 0 ? round2((quantity / sold) * Number(line.discount)) : 0;
  return { unitPrice, sub, taxPct, tax, disc, total: Math.max(0, round2(sub + tax - disc)) };
}
