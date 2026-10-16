import { TIME_ZONE } from './format';

/** Calendar helpers in the business time zone (Asia/Dhaka, UTC+6, no DST). */

const ymd = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TIME_ZONE });

export const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Today's date (YYYY-MM-DD) in the business time zone. */
export const today = (): string => ymd.format(new Date());

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** First and last day of the month containing `date`. */
export function monthRange(date: string): { from: string; to: string } {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

/** UTC instant bounds of a business-day range, for timestamp columns. */
export function instantRange(from: string, to: string): { start: string; end: string } {
  return { start: new Date(`${from}T00:00:00+06:00`).toISOString(), end: new Date(`${addDays(to, 1)}T00:00:00+06:00`).toISOString() };
}

/** Dates from `from` to `to` inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}
