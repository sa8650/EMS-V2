import 'server-only';

/**
 * HTML slips for ConnectX emails: invoices, returns and exchanges. Email
 * clients need table layout and inline styles; every value is HTML-escaped.
 */

export const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (v: unknown) => `BDT ${Number(v || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface SlipShop { name: string; address: string | null; phone: string | null; email: string | null }
export interface SlipLine { name: string; quantity: number; unitPrice: number; total: number; note?: string }

export function documentSlip(o: {
  shop: SlipShop;
  title: string;
  number: string;
  date: string;
  party: string | null;
  lines: SlipLine[];
  totals: [string, unknown][];
  verifyUrl?: string;
}): string {
  const td = 'padding:6px;border-bottom:1px solid #eee;font-size:12px';
  const rows = o.lines.map((l) =>
    `<tr><td style="${td}">${escapeHtml(l.name)}${l.note ? `<br><span style="color:#777">${escapeHtml(l.note)}</span>` : ''}</td>` +
    `<td style="${td};text-align:right">${escapeHtml(l.quantity)}</td><td style="${td};text-align:right">${money(l.unitPrice)}</td><td style="${td};text-align:right">${money(l.total)}</td></tr>`).join('');
  const totals = o.totals.map(([k, v]) => `<tr><td style="padding:4px;font-size:12px">${escapeHtml(k)}</td><td style="padding:4px;text-align:right;font-size:12px">${money(v)}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #ddd;font-family:Arial,sans-serif;color:#141414">
<tr><td style="padding:20px">
<table role="presentation" width="100%"><tr>
<td><b style="font-size:16px">${escapeHtml(o.shop.name)}</b><br><span style="font-size:12px;color:#555">${escapeHtml([o.shop.address, o.shop.phone, o.shop.email].filter(Boolean).join(' · '))}</span></td>
<td style="text-align:right"><b style="font-size:16px">${escapeHtml(o.title)}</b><br><span style="font-size:12px">${escapeHtml(o.number)} · ${escapeHtml(o.date)}</span></td>
</tr></table>
<p style="font-size:12px;margin:16px 0 8px">Customer: <b>${escapeHtml(o.party ?? 'Walk-in customer')}</b></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<th style="text-align:left;font-size:11px;padding:6px;background:#f5f5f5">Item</th><th style="text-align:right;font-size:11px;padding:6px;background:#f5f5f5">Qty</th>
<th style="text-align:right;font-size:11px;padding:6px;background:#f5f5f5">Price</th><th style="text-align:right;font-size:11px;padding:6px;background:#f5f5f5">Total</th></tr>${rows}</table>
<table role="presentation" style="margin-left:auto;margin-top:12px">${totals}</table>
${o.verifyUrl ? `<p style="margin-top:16px;padding-top:12px;border-top:1px dashed #ccc;font-size:11px;color:#666">TrueBill verification: <a href="${escapeHtml(o.verifyUrl)}" style="color:#0284c7">${escapeHtml(o.verifyUrl)}</a></p>` : ''}
</td></tr></table>`;
}
