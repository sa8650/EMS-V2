import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import s from './ui.module.css';

export function Card({ title, actions, children, className, bodyless }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyless?: boolean }) {
  return (
    <section className={[s.card, className].filter(Boolean).join(' ')}>
      {(title || actions) && (
        <header className={s.cardHeader}>
          {title && <h2 className={s.cardTitle}>{title}</h2>}
          {actions}
        </header>
      )}
      {bodyless ? children : <div className={s.cardBody}>{children}</div>}
    </section>
  );
}

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={[s.badge, tone !== 'neutral' && s[`badge-${tone}`]].filter(Boolean).join(' ')}>{children}</span>;
}

const ALERT_ICONS: Record<Exclude<Tone, 'neutral'>, LucideIcon> = { success: CheckCircle2, warning: AlertTriangle, danger: XCircle, info: Info };

export function Alert({ tone = 'info', children, role }: { tone?: Exclude<Tone, 'neutral'>; children: ReactNode; role?: 'status' | 'alert' }) {
  const Icon = ALERT_ICONS[tone];
  return (
    <div className={`${s.alert} ${s[`alert-${tone}`]}`} role={role ?? (tone === 'danger' ? 'alert' : 'status')}>
      <Icon aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      {Icon && <Icon aria-hidden />}
      <p className={s.emptyTitle}>{title}</p>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ width = '100%', height = '1rem', style }: { width?: string; height?: string; style?: CSSProperties }) {
  return <span className={s.skeleton} style={{ width, height, ...style }} aria-hidden />;
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className={s.stat}>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statValue}>{value}</span>
      {note && <span className={s.statNote}>{note}</span>}
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  numeric?: boolean;
}

/** Plain, accessible data table; `empty` is shown when there are no rows. */
export function DataTable<T>({ columns, rows, rowKey, empty, caption }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; empty?: ReactNode; caption?: string }) {
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        {caption && <caption className="visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? s.num : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className={c.numeric ? s.num : undefined}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Previous/next paging with links that keep the other query parameters. */
export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className={s.pagination} aria-label="Pagination">
      <span>
        Page {page} of {pages} · {total} records
      </span>
      <span style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {page > 1 ? <Link className={`${s.button} ${s.small}`} href={href(page - 1)}>Previous</Link> : null}
        {page < pages ? <Link className={`${s.button} ${s.small}`} href={href(page + 1)}>Next</Link> : null}
      </span>
    </nav>
  );
}

export function Tabs({ items, current, label }: { items: { href: string; label: string; key: string }[]; current: string; label: string }) {
  return (
    <nav className={s.tabs} aria-label={label}>
      {items.map((t) => (
        <Link key={t.key} href={t.href} className={s.tab} aria-current={t.key === current ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export const tableStyles = { num: s.num, muted: s.muted, mono: s.mono };
