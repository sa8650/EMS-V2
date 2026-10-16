'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/display';
import { ActionForm, FormGrid, SelectField, TextArea, TextField } from '@/components/ui/form';
import ui from '@/components/ui/ui.module.css';
import { computeInvoiceTotals, round2 } from '@/lib/invoice-math';
import { formatMoney, formatNumber } from '@/lib/format';
import { postInvoiceAction } from '../_actions/invoices';
import s from './invoice.module.css';

export interface ProductOption { id: string; code: string; name: string; unit: string; sale_price: number; stock: number }
export interface PartyOption { id: string; code: string; name: string; phone: string | null }

interface Line { key: number; product_id: string; quantity: string; unit_price: string; tax_percent: string; discount: string }

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'bank', label: 'Bank' },
  { value: 'other', label: 'Other' },
];

export function InvoiceEditor({ kind, products, parties, defaultDate }: { kind: 'sale' | 'purchase'; products: ProductOption[]; parties: PartyOption[]; defaultDate: string }) {
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState('');
  const [partyId, setPartyId] = useState('');
  const [header, setHeader] = useState({ tax_percent: '0', discount: '0', paid: '0' });
  const [nextKey, setNextKey] = useState(1);

  const addProduct = (value: string) => {
    const label = value.trim().toLowerCase();
    if (!label) return;
    const p = products.find((x) => `${x.code} — ${x.name}`.toLowerCase() === label) ?? products.find((x) => x.code.toLowerCase() === label);
    if (!p) return;
    setLines((ls) => {
      const existing = ls.find((l) => l.product_id === p.id);
      if (existing) return ls.map((l) => (l === existing ? { ...l, quantity: String(Number(l.quantity || 0) + 1) } : l));
      return [...ls, { key: nextKey, product_id: p.id, quantity: '1', unit_price: kind === 'sale' ? String(p.sale_price) : '', tax_percent: '0', discount: '0' }];
    });
    setNextKey((k) => k + 1);
    setPick('');
  };

  const update = (key: number, field: keyof Line, value: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));

  const preview = useMemo(() => {
    if (!lines.length) return { totals: null, error: null as string | null };
    try {
      const totals = computeInvoiceTotals(
        lines.map((l) => ({ quantity: l.quantity || 0, unitPrice: l.unit_price || 0, taxPercent: l.tax_percent || 0, discount: l.discount || 0, label: byId.get(l.product_id)?.code })),
        { taxPercent: header.tax_percent || 0, discount: header.discount || 0, paid: header.paid || 0 },
      );
      return { totals, error: null };
    } catch (e) {
      return { totals: null, error: e instanceof Error ? e.message : 'Check the amounts.' };
    }
  }, [lines, header, byId]);

  const shortages = kind === 'sale'
    ? lines.filter((l) => {
        const p = byId.get(l.product_id);
        const wanted = lines.filter((x) => x.product_id === l.product_id).reduce((t, x) => t + Number(x.quantity || 0), 0);
        return p && wanted > Number(p.stock);
      })
    : [];

  const payload = JSON.stringify(lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price, tax_percent: l.tax_percent || 0, discount: l.discount || 0 })));
  const total = preview.totals?.total ?? 0;

  return (
    <ActionForm action={postInvoiceAction} submitLabel={kind === 'sale' ? 'Save sale' : 'Save purchase'}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="lines" value={payload} />

      <section className={s.panel}>
        <FormGrid>
          <SelectField
            label={kind === 'sale' ? 'Customer' : 'Supplier'}
            name="party_id"
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
            optional
            options={[{ value: '', label: kind === 'sale' ? 'Walk-in customer' : 'Unlisted supplier' }, ...parties.map((p) => ({ value: p.id, label: `${p.name} (${p.code}${p.phone ? ` · ${p.phone}` : ''})` }))]}
          />
          <TextField label="Date" name="invoice_date" type="date" defaultValue={defaultDate} />
        </FormGrid>
        {!partyId && (
          <FormGrid>
            <TextField label="Name" name="party_name" optional autoComplete="off" />
            <TextField label="Phone" name="party_phone" type="tel" optional autoComplete="off" />
          </FormGrid>
        )}
      </section>

      <section className={s.panel}>
        <div className={s.picker}>
          <label className="visually-hidden" htmlFor="product-pick">Add a product</label>
          <input
            id="product-pick"
            className={ui.control}
            list="product-options"
            value={pick}
            placeholder="Type a product name or code, then press Enter"
            onChange={(e) => {
              setPick(e.target.value);
              if (products.some((x) => `${x.code} — ${x.name}` === e.target.value)) addProduct(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addProduct(pick);
              }
            }}
          />
          <datalist id="product-options">
            {products.map((p) => (
              <option key={p.id} value={`${p.code} — ${p.name}`} />
            ))}
          </datalist>
          <Button onClick={() => addProduct(pick)} aria-label="Add product">
            <Plus aria-hidden /> Add
          </Button>
        </div>

        {lines.length ? (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" className={ui.num}>Qty</th>
                  <th scope="col" className={ui.num}>Unit price</th>
                  <th scope="col" className={ui.num}>VAT %</th>
                  <th scope="col" className={ui.num}>Discount</th>
                  <th scope="col" className={ui.num}>Line total</th>
                  <th scope="col"><span className="visually-hidden">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const p = byId.get(l.product_id);
                  const lt = preview.totals?.lines[i];
                  return (
                    <tr key={l.key}>
                      <td>
                        <strong>{p?.name}</strong>
                        <div className={ui.muted}>
                          {p?.code}
                          {kind === 'sale' && p ? ` · ${formatNumber(p.stock)} ${p.unit} in stock` : ''}
                        </div>
                      </td>
                      <td className={ui.num}><input aria-label="Quantity" className={`${ui.control} ${s.cell}`} type="number" min="0" step="any" value={l.quantity} onChange={(e) => update(l.key, 'quantity', e.target.value)} /></td>
                      <td className={ui.num}><input aria-label="Unit price" className={`${ui.control} ${s.cell}`} type="number" min="0" step="0.01" value={l.unit_price} onChange={(e) => update(l.key, 'unit_price', e.target.value)} /></td>
                      <td className={ui.num}><input aria-label="VAT percent" className={`${ui.control} ${s.cellSmall}`} type="number" min="0" max="100" step="0.01" value={l.tax_percent} onChange={(e) => update(l.key, 'tax_percent', e.target.value)} /></td>
                      <td className={ui.num}><input aria-label="Discount" className={`${ui.control} ${s.cell}`} type="number" min="0" step="0.01" value={l.discount} onChange={(e) => update(l.key, 'discount', e.target.value)} /></td>
                      <td className={ui.num}>{lt ? formatMoney(lt.total) : '—'}</td>
                      <td>
                        <Button variant="ghost" size="small" iconOnly aria-label={`Remove ${p?.name ?? 'line'}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                          <Trash2 aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={ui.muted} style={{ padding: 'var(--space-4) 0' }}>No items yet. {products.length ? 'Search for a product above.' : 'Add products in Inventory first.'}</p>
        )}
        {shortages.length > 0 && (
          <Alert tone="warning">Not enough stock for {[...new Set(shortages.map((l) => byId.get(l.product_id)?.name))].join(', ')}.</Alert>
        )}
      </section>

      <div className={s.footer}>
        <section className={s.panel}>
          <FormGrid>
            <TextField label="Invoice VAT %" name="tax_percent" type="number" min="0" max="100" step="0.01" value={header.tax_percent} onChange={(e) => setHeader({ ...header, tax_percent: e.target.value })} hint="Applied to the subtotal" />
            <TextField label="Invoice discount (৳)" name="discount" type="number" min="0" step="0.01" value={header.discount} onChange={(e) => setHeader({ ...header, discount: e.target.value })} />
          </FormGrid>
          <FormGrid>
            <SelectField label="Payment method" name="payment_method" options={METHODS} />
            <TextField label="Transaction ID" name="transaction_id" optional autoComplete="off" />
          </FormGrid>
          <TextArea label="Notes" name="notes" rows={2} optional />
        </section>

        <section className={`${s.panel} ${s.summary}`} aria-live="polite">
          <dl className={s.totals}>
            <dt>Subtotal</dt><dd>{formatMoney(preview.totals?.subtotal ?? 0)}</dd>
            <dt>Item VAT</dt><dd>{formatMoney(preview.totals?.lineTaxAmount ?? 0)}</dd>
            <dt>Item discounts</dt><dd>−{formatMoney(preview.totals?.lineDiscountAmount ?? 0)}</dd>
            <dt>Invoice VAT</dt><dd>{formatMoney(preview.totals?.taxAmount ?? 0)}</dd>
            <dt>Invoice discount</dt><dd>−{formatMoney(preview.totals?.discount ?? 0)}</dd>
            <dt className={s.grand}>Total</dt><dd className={s.grand}>{formatMoney(total)}</dd>
          </dl>
          <div className={s.paidRow}>
            <TextField label="Paid now (৳)" name="paid" type="number" min="0" step="0.01" value={header.paid} onChange={(e) => setHeader({ ...header, paid: e.target.value })} />
            <Button size="small" onClick={() => setHeader({ ...header, paid: String(round2(total)) })}>Paid in full</Button>
          </div>
          <p className={s.due}>
            {preview.totals ? (
              preview.totals.totalDue > 0 ? <Badge tone="warning">Due {formatMoney(preview.totals.totalDue)}</Badge> : <Badge tone="success">Fully paid</Badge>
            ) : null}
          </p>
          {preview.error && <Alert tone="danger">{preview.error}</Alert>}
        </section>
      </div>
    </ActionForm>
  );
}
