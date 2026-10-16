'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ActionForm, FormGrid, SelectField, TextArea, TextField } from '@/components/ui/form';
import ui from '@/components/ui/ui.module.css';
import { returnedLineValue, round2 } from '@/lib/invoice-math';
import { formatMoney, formatNumber } from '@/lib/format';
import { createReturnAction } from './actions';
import s from '../_components/invoice.module.css';

export interface ReturnLine { id: string; product_name: string; code: string; quantity: number; unit_price: number; tax_percent: number; discount: number; returnable: number }
export interface Product { id: string; code: string; name: string; sale_price: number; stock: number; unit: string }

const REASONS = [
  { value: 'changed_mind', label: 'Customer changed mind' },
  { value: 'defective', label: 'Defective' },
  { value: 'wrong_product', label: 'Wrong product' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'wrong_spec', label: 'Wrong specification' },
  { value: 'other', label: 'Other' },
];
const CONDITIONS = [
  { value: 'sellable', label: 'Sellable — back to stock' },
  { value: 'damaged', label: 'Damaged — keep apart' },
  { value: 'defective', label: 'Defective — keep apart' },
];
const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'bank', label: 'Bank' },
  { value: 'other', label: 'Other' },
];

interface Back { quantity: string; reason: string; reason_note: string; condition: string; penalty: string }
interface Fresh { key: number; product_id: string; quantity: string; unit_price: string; tax_percent: string; discount: string }

export function ReturnEditor({ invoiceId, invoiceTax, lines, products }: { invoiceId: string; invoiceTax: number; lines: ReturnLine[]; products: Product[] }) {
  const [mode, setMode] = useState<'return' | 'exchange'>('return');
  const [back, setBack] = useState<Record<string, Back>>(() => Object.fromEntries(lines.map((l) => [l.id, { quantity: '0', reason: 'changed_mind', reason_note: '', condition: 'sellable', penalty: '0' }])));
  const [fresh, setFresh] = useState<Fresh[]>([]);
  const [pick, setPick] = useState('');
  const [key, setKey] = useState(1);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const chosen = lines.filter((l) => Number(back[l.id]?.quantity) > 0);
  const returnedValue = round2(chosen.reduce((t, l) => {
    const b = back[l.id]!;
    const v = returnedLineValue({ quantity: l.quantity, unitPrice: l.unit_price, taxPercent: l.tax_percent, discount: l.discount }, invoiceTax, Number(b.quantity));
    return t + Math.max(0, v.total - (mode === 'return' ? Number(b.penalty || 0) : 0));
  }, 0));
  const freshValue = round2(fresh.reduce((t, f) => {
    const sub = round2(Number(f.quantity || 0) * Number(f.unit_price || 0));
    return t + Math.max(0, round2(sub + round2((sub * Number(f.tax_percent || 0)) / 100) - Number(f.discount || 0)));
  }, 0));
  const difference = round2(freshValue - returnedValue);

  const set = (id: string, field: keyof Back, value: string) => setBack((b) => ({ ...b, [id]: { ...b[id]!, [field]: value } }));
  const add = () => {
    const p = products.find((x) => `${x.code} — ${x.name}`.toLowerCase() === pick.trim().toLowerCase());
    if (!p) return;
    setFresh((f) => [...f, { key, product_id: p.id, quantity: '1', unit_price: String(p.sale_price), tax_percent: '0', discount: '0' }]);
    setKey((k) => k + 1);
    setPick('');
  };

  const returnedPayload = JSON.stringify(chosen.map((l) => ({ invoice_line_id: l.id, ...back[l.id], penalty: mode === 'return' ? back[l.id]!.penalty || 0 : undefined })));
  const freshPayload = JSON.stringify(fresh.map((f) => ({ product_id: f.product_id, quantity: f.quantity, unit_price: f.unit_price, tax_percent: f.tax_percent || 0, discount: f.discount || 0 })));

  return (
    <>
      <div role="group" aria-label="Return or exchange" style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button variant={mode === 'return' ? 'primary' : 'default'} aria-pressed={mode === 'return'} onClick={() => setMode('return')}>Return & refund</Button>
        <Button variant={mode === 'exchange' ? 'primary' : 'default'} aria-pressed={mode === 'exchange'} onClick={() => setMode('exchange')}>Exchange</Button>
      </div>
      <ActionForm action={createReturnAction} submitLabel={mode === 'return' ? 'Save return' : 'Save exchange'}>
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="invoice_id" value={invoiceId} />
        <input type="hidden" name={mode === 'return' ? 'items' : 'returned'} value={returnedPayload} />
        {mode === 'exchange' && <input type="hidden" name="new_items" value={freshPayload} />}

        <section className={s.panel}>
          <h2 className={ui.label}>Items coming back</h2>
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" className={ui.num}>Qty back</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Condition</th>
                  {mode === 'return' && <th scope="col" className={ui.num}>Penalty</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const b = back[l.id]!;
                  return (
                    <tr key={l.id}>
                      <td>
                        <strong>{l.product_name}</strong>
                        <div className={ui.muted}>{l.code} · sold {formatNumber(l.quantity)} at {formatMoney(l.unit_price)} · {formatNumber(l.returnable)} returnable</div>
                      </td>
                      <td className={ui.num}><input aria-label={`Quantity of ${l.product_name} coming back`} className={`${ui.control} ${s.cellSmall}`} type="number" min="0" max={l.returnable} step="any" value={b.quantity} disabled={l.returnable <= 0} onChange={(e) => set(l.id, 'quantity', e.target.value)} /></td>
                      <td>
                        <select aria-label="Reason" className={ui.control} value={b.reason} onChange={(e) => set(l.id, 'reason', e.target.value)} disabled={Number(b.quantity) <= 0}>
                          {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        {b.reason === 'other' && Number(b.quantity) > 0 && <input aria-label="Reason note" placeholder="Note (required)" className={ui.control} value={b.reason_note} onChange={(e) => set(l.id, 'reason_note', e.target.value)} />}
                      </td>
                      <td>
                        <select aria-label="Condition" className={ui.control} value={b.condition} onChange={(e) => set(l.id, 'condition', e.target.value)} disabled={Number(b.quantity) <= 0}>
                          {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </td>
                      {mode === 'return' && (
                        <td className={ui.num}><input aria-label="Penalty" className={`${ui.control} ${s.cell}`} type="number" min="0" step="0.01" value={b.penalty} onChange={(e) => set(l.id, 'penalty', e.target.value)} disabled={Number(b.quantity) <= 0} /></td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {mode === 'exchange' && (
          <section className={s.panel}>
            <h2 className={ui.label}>Replacement items</h2>
            <div className={s.picker}>
              <input className={ui.control} list="exchange-products" value={pick} onChange={(e) => setPick(e.target.value)} placeholder="Type a product name or code" aria-label="Add a replacement product"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
              <datalist id="exchange-products">{products.map((p) => <option key={p.id} value={`${p.code} — ${p.name}`} />)}</datalist>
              <Button onClick={add}><Plus aria-hidden /> Add</Button>
            </div>
            {fresh.map((f) => {
              const p = byId.get(f.product_id);
              const upd = (field: keyof Fresh, value: string) => setFresh((xs) => xs.map((x) => (x.key === f.key ? { ...x, [field]: value } : x)));
              return (
                <FormGrid key={f.key}>
                  <div><strong>{p?.name}</strong><div className={ui.muted}>{p?.code} · {formatNumber(p?.stock ?? 0)} {p?.unit} in stock</div></div>
                  <input aria-label="Quantity" className={ui.control} type="number" min="0" step="any" value={f.quantity} onChange={(e) => upd('quantity', e.target.value)} />
                  <input aria-label="Unit price" className={ui.control} type="number" min="0" step="0.01" value={f.unit_price} onChange={(e) => upd('unit_price', e.target.value)} />
                  <Button variant="ghost" size="small" onClick={() => setFresh((xs) => xs.filter((x) => x.key !== f.key))} aria-label={`Remove ${p?.name}`}><Trash2 aria-hidden /></Button>
                </FormGrid>
              );
            })}
          </section>
        )}

        <div className={s.footer}>
          <section className={s.panel}>
            <FormGrid>
              <SelectField label={mode === 'return' ? 'Refund method' : 'Difference paid / refunded by'} name={mode === 'return' ? 'refund_method' : 'payment_method'} options={mode === 'return' ? [...METHODS, { value: 'none', label: 'No refund yet' }] : METHODS} />
              <TextField label="Transaction ID" name="transaction_id" optional autoComplete="off" />
            </FormGrid>
            <TextArea label="Notes" name="notes" rows={2} optional />
          </section>
          <section className={`${s.panel} ${s.summary}`} aria-live="polite">
            <dl className={s.totals}>
              <dt>Value coming back</dt><dd>{formatMoney(returnedValue)}</dd>
              {mode === 'exchange' && <><dt>Replacement value</dt><dd>{formatMoney(freshValue)}</dd></>}
              <dt className={s.grand}>{mode === 'return' ? 'Refund' : difference > 0 ? 'Customer pays' : difference < 0 ? 'Refund to customer' : 'Even exchange'}</dt>
              <dd className={s.grand}>{formatMoney(mode === 'return' ? returnedValue : Math.abs(difference))}</dd>
            </dl>
          </section>
        </div>
      </ActionForm>
    </>
  );
}
