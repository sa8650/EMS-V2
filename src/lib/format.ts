/** Display formatting shared by server and browser (Bangladesh conventions). */

export const TIME_ZONE = 'Asia/Dhaka';

const moneyFormat = new Intl.NumberFormat('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFormat = new Intl.NumberFormat('en-BD', { maximumFractionDigits: 3 });
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TIME_ZONE });
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });

export function formatMoney(value: unknown): string {
  const n = Number(value) || 0;
  return `${n < 0 ? '-' : ''}৳${moneyFormat.format(Math.abs(n))}`;
}

export const formatNumber = (value: unknown): string => numberFormat.format(Number(value) || 0);

/** `YYYY-MM-DD` dates are calendar dates (no time zone shift); timestamps are shown in Dhaka time. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+06:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateFormat.format(d);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFormat.format(d);
}
