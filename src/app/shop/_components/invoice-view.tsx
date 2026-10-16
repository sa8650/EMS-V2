import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/console/bento';
import { ConfirmAction } from '@/components/console/confirm-action';
import { PrintButton } from '@/components/console/print-button';
import { ButtonLink } from '@/components/ui/button';
import { Alert, Badge, DataTable, tableStyles } from '@/components/ui/display';
import { QrCode } from '@/components/ui/qr-code';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireShopView } from '@/server/auth/guards';
import { DbError } from '@/server/db';
import { AppError } from '@/server/errors';
import { addonAllowance } from '@/server/licensing';
import { getInvoice, PAYMENT_LABELS, type InvoiceDetail, type InvoiceKind } from '@/server/services/invoices';
import { siteOrigin } from '@/server/site';
import { deleteInvoiceAction } from '../_actions/invoices';
import s from './invoice.module.css';

export async function InvoiceView({ kind, id, created }: { kind: InvoiceKind; id: string; created?: boolean }) {
  const ctx = await requireShopView(kind === 'sale' ? 'sales' : 'purchase');
  let detail: InvoiceDetail;
  try {
    detail = await getInvoice(ctx.db, ctx.shop.id, id, kind);
  } catch (e) {
    if ((e instanceof AppError || e instanceof DbError) && e.status === 404) notFound();
    throw e;
  }
  const { invoice: inv, lines, payments, returns, exchanges } = detail;
  const base = kind === 'sale' ? '/shop/sales' : '/shop/purchases';
  const section = kind === 'sale' ? 'sales' : 'purchase';
  const [truebill, origin] = await Promise.all([addonAllowance(ctx.db, ctx.shop.admin_id, 'truebill'), siteOrigin()]);
  const verifyUrl = `${origin}/verify/${inv.verification_token}`;
  const locked = returns.length > 0 || exchanges.length > 0 || payments.length > 0;
  const writable = !ctx.readOnly;

  return (
    <>
      <PageHeader
        title={`${kind === 'sale' ? 'Sale' : 'Purchase'} ${inv.number}`}
        description={`Created ${formatDateTime(inv.created_at)}`}
        actions={
          <div className={s.actions}>
            <ButtonLink href={base}>All {kind === 'sale' ? 'sales' : 'purchases'}</ButtonLink>
            <PrintButton />
            {kind === 'sale' && writable && can(ctx.permissions, 'returns_refunds', 'add') && lines.some((l) => l.returned < Number(l.quantity)) && (
              <ButtonLink href={`/shop/returns/new?invoice=${inv.id}`}>Return or exchange</ButtonLink>
            )}
            {Number(inv.due) > 0 && writable && can(ctx.permissions, 'due_recover', 'add') && (
              <ButtonLink href={`/shop/dues?tab=${kind === 'sale' ? 'receivable' : 'payable'}&q=${encodeURIComponent(inv.number)}`} variant="primary">
                {kind === 'sale' ? 'Collect due' : 'Pay due'}
              </ButtonLink>
            )}
            {writable && can(ctx.permissions, section, 'delete') && !locked && (
              <ConfirmAction
                label="Delete"
                title="Delete invoice?"
                message={<>Delete <strong>{inv.number}</strong>? Its stock movement is reversed. This cannot be undone.</>}
                confirmLabel="Delete invoice"
                action={deleteInvoiceAction}
                fields={{ id: inv.id, kind }}
              />
            )}
          </div>
        }
      />
      {created && <Alert tone="success">Invoice {inv.number} saved.</Alert>}

      <article className={s.doc} aria-label={`Invoice ${inv.number}`}>
        <header className={s.docHead}>
          <div>
            <p className={s.docShop}>{ctx.shop.name}</p>
            <p className={s.docMeta}>{[ctx.shop.address, ctx.shop.phone, ctx.shop.email].filter(Boolean).join(' · ')}</p>
          </div>
          <div>
            <p className={s.docTitle}>{kind === 'sale' ? 'INVOICE' : 'PURCHASE'}</p>
            <p className={s.docMeta} style={{ textAlign: 'right' }}>
              <span className="mono">{inv.number}</span> · {formatDate(inv.invoice_date)}
            </p>
          </div>
        </header>

        <div className={s.docParties}>
          <div>
            <p className={s.docMeta}>{kind === 'sale' ? 'Bill to' : 'Supplier'}</p>
            <p><strong>{inv.party_name ?? (kind === 'sale' ? 'Walk-in customer' : '—')}</strong></p>
            <p className={s.docMeta}>{[inv.party_phone, inv.party_address].filter(Boolean).join(' · ')}</p>
          </div>
          {truebill && kind === 'sale' && (
            <div className={s.qr}>
              <QrCode value={verifyUrl} label="Scan to verify this invoice" />
              <span>Scan to verify</span>
            </div>
          )}
        </div>

        <DataTable
          caption="Items"
          rows={lines}
          rowKey={(l) => l.id}
          columns={[
            { key: 'item', header: 'Item', cell: (l) => <><strong>{l.product_name}</strong> <span className={tableStyles.muted}>{l.code}</span>{l.returned > 0 && <> <Badge tone="info">{formatNumber(l.returned)} returned</Badge></>}</> },
            { key: 'qty', header: 'Qty', numeric: true, cell: (l) => `${formatNumber(l.quantity)} ${l.unit}` },
            { key: 'price', header: 'Price', numeric: true, cell: (l) => formatMoney(l.unit_price) },
            { key: 'vat', header: 'VAT', numeric: true, cell: (l) => (Number(l.tax_percent) ? `${formatNumber(l.tax_percent)}%` : '—') },
            { key: 'disc', header: 'Discount', numeric: true, cell: (l) => (Number(l.discount) ? formatMoney(l.discount) : '—') },
            { key: 'total', header: 'Total', numeric: true, cell: (l) => formatMoney(l.line_total) },
          ]}
        />

        <dl className={`${s.totals} ${s.docTotals}`}>
          <dt>Subtotal</dt><dd>{formatMoney(inv.subtotal)}</dd>
          {Number(inv.line_tax) > 0 && <><dt>Item VAT</dt><dd>{formatMoney(inv.line_tax)}</dd></>}
          {Number(inv.line_discount) > 0 && <><dt>Item discounts</dt><dd>−{formatMoney(inv.line_discount)}</dd></>}
          {Number(inv.tax_amount) > 0 && <><dt>VAT ({formatNumber(inv.tax_percent)}%)</dt><dd>{formatMoney(inv.tax_amount)}</dd></>}
          {Number(inv.discount) > 0 && <><dt>Discount</dt><dd>−{formatMoney(inv.discount)}</dd></>}
          <dt className={s.grand}>Total</dt><dd className={s.grand}>{formatMoney(inv.total)}</dd>
          <dt>Paid ({PAYMENT_LABELS[inv.payment_method as keyof typeof PAYMENT_LABELS] ?? inv.payment_method}{inv.transaction_id ? ` · ${inv.transaction_id}` : ''})</dt><dd>{formatMoney(inv.paid)}</dd>
          <dt><strong>Due</strong></dt><dd><strong>{formatMoney(inv.due)}</strong></dd>
        </dl>
        {inv.notes && <p className={s.docMeta}>Note: {inv.notes}</p>}
      </article>

      {(payments.length > 0 || returns.length > 0 || exchanges.length > 0) && (
        <section className={s.panel}>
          {payments.length > 0 && (
            <div>
              <h2 className={s.docMeta}>Due payments</h2>
              <ul>
                {payments.map((p) => (
                  <li key={p.id}>
                    {formatDateTime(p.created_at)} · {formatMoney(p.amount)} · {PAYMENT_LABELS[p.payment_method as keyof typeof PAYMENT_LABELS] ?? p.payment_method}
                    {p.note ? ` · ${p.note}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {returns.length > 0 && (
            <div>
              <h2 className={s.docMeta}>Returns</h2>
              <ul>
                {returns.map((r) => (
                  <li key={r.id}>
                    <Link href={`/shop/returns/${r.id}`} className="mono">{r.number}</Link> · {formatDate(r.return_date)} · refund {formatMoney(r.refunded)} of {formatMoney(r.total)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {exchanges.length > 0 && (
            <div>
              <h2 className={s.docMeta}>Exchanges</h2>
              <ul>
                {exchanges.map((x) => (
                  <li key={x.id}>
                    <Link href={`/shop/returns/exchange/${x.id}`} className="mono">{x.number}</Link> · {formatDate(x.exchange_date)} · difference {formatMoney(x.difference)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </>
  );
}
