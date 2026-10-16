import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/console/bento';
import { PrintButton } from '@/components/console/print-button';
import { ButtonLink } from '@/components/ui/button';
import { Alert, Badge, DataTable, tableStyles } from '@/components/ui/display';
import { QrCode } from '@/components/ui/qr-code';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { requireShopView } from '@/server/auth/guards';
import { DbError } from '@/server/db';
import { AppError } from '@/server/errors';
import { addonAllowance } from '@/server/licensing';
import { PAYMENT_LABELS } from '@/server/services/invoices';
import { CONDITIONS, getExchange, getReturn, RETURN_REASONS } from '@/server/services/returns';
import { siteOrigin } from '@/server/site';
import s from '../_components/invoice.module.css';

async function load<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if ((e instanceof AppError || e instanceof DbError) && e.status === 404) notFound();
    throw e;
  }
}

const method = (m: string | null) => (m ? (PAYMENT_LABELS[m as keyof typeof PAYMENT_LABELS] ?? (m === 'none' ? 'Not refunded' : m)) : '—');

async function Document({ kind, number, date, token, invoiceNumber, customer, created, rows, totals, notes }: {
  kind: 'Return' | 'Exchange';
  number: string;
  date: string;
  token: string;
  invoiceNumber: string;
  customer: string | null;
  created: boolean;
  rows: ReactNode;
  totals: ReactNode;
  notes: string | null;
}) {
  const ctx = await requireShopView('returns_refunds');
  const [truebill, origin] = await Promise.all([addonAllowance(ctx.db, ctx.shop.admin_id, 'truebill'), siteOrigin()]);
  return (
    <>
      <PageHeader title={`${kind} ${number}`} actions={<div className={s.actions}><ButtonLink href={kind === 'Return' ? '/shop/returns' : '/shop/returns?tab=exchanges'}>Back</ButtonLink><PrintButton /></div>} />
      {created && <Alert tone="success">{kind} {number} saved. Stock has been updated.</Alert>}
      <article className={s.doc}>
        <header className={s.docHead}>
          <div>
            <p className={s.docShop}>{ctx.shop.name}</p>
            <p className={s.docMeta}>{[ctx.shop.address, ctx.shop.phone].filter(Boolean).join(' · ')}</p>
          </div>
          <div>
            <p className={s.docTitle}>{kind.toUpperCase()}</p>
            <p className={s.docMeta} style={{ textAlign: 'right' }}><span className="mono">{number}</span> · {formatDate(date)}</p>
          </div>
        </header>
        <div className={s.docParties}>
          <div>
            <p className={s.docMeta}>Customer · original invoice</p>
            <p><strong>{customer ?? 'Walk-in customer'}</strong> · <span className="mono">{invoiceNumber}</span></p>
          </div>
          {truebill && (
            <div className={s.qr}>
              <QrCode value={`${origin}/verify/${token}`} label={`Scan to verify this ${kind.toLowerCase()}`} />
              <span>Scan to verify</span>
            </div>
          )}
        </div>
        {rows}
        {totals}
        {notes && <p className={s.docMeta}>Note: {notes}</p>}
      </article>
    </>
  );
}

export async function ReturnDocument({ id, created }: { id: string; created: boolean }) {
  const ctx = await requireShopView('returns_refunds');
  const { ret, items } = await load(() => getReturn(ctx.db, ctx.shop.id, id));
  return (
    <Document
      kind="Return" number={ret.number} date={ret.return_date} token={ret.verification_token} invoiceNumber={ret.invoices?.number ?? '—'} customer={ret.customer_name} created={created} notes={ret.notes}
      rows={
        <DataTable caption="Returned items" rows={items} rowKey={(i) => i.id} columns={[
          { key: 'item', header: 'Item', cell: (i) => <><strong>{i.products?.name}</strong> <span className={tableStyles.muted}>{i.products?.code}</span></> },
          { key: 'qty', header: 'Qty', numeric: true, cell: (i) => `${formatNumber(i.quantity)} ${i.products?.unit ?? ''}` },
          { key: 'reason', header: 'Reason', cell: (i) => <>{RETURN_REASONS[i.reason as keyof typeof RETURN_REASONS] ?? i.reason}{i.reason_note && <span className={tableStyles.muted}> — {i.reason_note}</span>}</> },
          { key: 'condition', header: 'Condition', cell: (i) => <Badge tone={i.condition === 'sellable' ? 'success' : 'danger'}>{CONDITIONS[i.condition as keyof typeof CONDITIONS] ?? i.condition}</Badge> },
          { key: 'amount', header: 'Amount', numeric: true, cell: (i) => formatMoney(i.amount) },
        ]} />
      }
      totals={
        <dl className={`${s.totals} ${s.docTotals}`}>
          <dt>Items</dt><dd>{formatMoney(ret.subtotal)}</dd>
          {Number(ret.tax_amount) > 0 && <><dt>VAT</dt><dd>{formatMoney(ret.tax_amount)}</dd></>}
          {Number(ret.discount_amount) > 0 && <><dt>Discount share</dt><dd>−{formatMoney(ret.discount_amount)}</dd></>}
          {Number(ret.penalty_amount) > 0 && <><dt>Penalty</dt><dd>−{formatMoney(ret.penalty_amount)}</dd></>}
          <dt className={s.grand}>Return value</dt><dd className={s.grand}>{formatMoney(ret.total)}</dd>
          <dt>Refunded ({method(ret.refund_method)}{ret.transaction_id ? ` · ${ret.transaction_id}` : ''})</dt><dd>{formatMoney(ret.refunded)}</dd>
        </dl>
      }
    />
  );
}

export async function ExchangeDocument({ id, created }: { id: string; created: boolean }) {
  const ctx = await requireShopView('returns_refunds');
  const { ex, items } = await load(() => getExchange(ctx.db, ctx.shop.id, id));
  return (
    <Document
      kind="Exchange" number={ex.number} date={ex.exchange_date} token={ex.verification_token} invoiceNumber={ex.invoices?.number ?? '—'} customer={ex.customer_name} created={created} notes={ex.notes}
      rows={
        <DataTable caption="Exchanged items" rows={items} rowKey={(i) => i.id} columns={[
          { key: 'dir', header: '', cell: (i) => <Badge tone={i.direction === 'returned' ? 'info' : 'success'}>{i.direction === 'returned' ? 'Came back' : 'Given'}</Badge> },
          { key: 'item', header: 'Item', cell: (i) => <><strong>{i.products?.name}</strong> <span className={tableStyles.muted}>{i.products?.code}</span></> },
          { key: 'qty', header: 'Qty', numeric: true, cell: (i) => `${formatNumber(i.quantity)} ${i.products?.unit ?? ''}` },
          { key: 'detail', header: 'Reason / condition', cell: (i) => (i.direction === 'returned' ? `${RETURN_REASONS[i.reason as keyof typeof RETURN_REASONS] ?? ''} · ${CONDITIONS[i.condition as keyof typeof CONDITIONS] ?? ''}` : '—') },
          { key: 'total', header: 'Value', numeric: true, cell: (i) => formatMoney(i.total) },
        ]} />
      }
      totals={
        <dl className={`${s.totals} ${s.docTotals}`}>
          <dt>Came back</dt><dd>{formatMoney(ex.returned_total)}</dd>
          <dt>Replacement</dt><dd>{formatMoney(ex.new_total)}</dd>
          <dt className={s.grand}>{ex.settlement === 'payment' ? 'Customer paid' : ex.settlement === 'refund' ? 'Refunded' : 'Even exchange'}</dt>
          <dd className={s.grand}>{formatMoney(Math.abs(Number(ex.difference)))}</dd>
          {ex.settlement !== 'even' && <><dt>Method</dt><dd>{method(ex.payment_method)}{ex.transaction_id ? ` · ${ex.transaction_id}` : ''}</dd></>}
        </dl>
      }
    />
  );
}
