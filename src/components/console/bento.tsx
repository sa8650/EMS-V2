import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import s from './console.module.css';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={s.pageHeader}>
      <div>
        <h1 className={s.pageTitle}>{title}</h1>
        {description && <p className={s.pageDescription}>{description}</p>}
      </div>
      {actions && <div className={s.pageActions}>{actions}</div>}
    </div>
  );
}

export function Bento({ children }: { children: ReactNode }) {
  return <div className={s.bento}>{children}</div>;
}

type Span = 3 | 4 | 5 | 6 | 7 | 8 | 12;

/**
 * A Bento tile. `flush` removes the padding for tables/lists that run edge to
 * edge; `accent` tints the tile with the console's role colour.
 */
export function Tile({ span = 4, title, icon: TileIcon, action, children, flush, accent, delay = 0 }: {
  span?: Span;
  title?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  accent?: boolean;
  delay?: number;
}) {
  const cls = [s.tile, s[`span${span}`], flush && s.tileFlush, accent && s.accentTile].filter(Boolean).join(' ');
  return (
    <section className={cls} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {(title || action) && (
        <div className={s.tileHead}>
          {title && (
            <h2 className={s.tileTitle}>
              {TileIcon && <TileIcon aria-hidden />}
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Minimal bar chart (no chart library): values with labels, scaled to the maximum. */
export function MiniBars({ data, format }: { data: { label: string; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure>
      <div className={s.bars} role="img" aria-label={data.map((d) => `${d.label}: ${format(d.value)}`).join(', ')}>
        {data.map((d) => (
          <div key={d.label} className={s.bar} style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} title={`${d.label}: ${format(d.value)}`} />
        ))}
      </div>
      {data.length > 1 && (
        <figcaption className={s.barLabels}>
          <span>{data[0]!.label}</span>
          <span>{data.at(-1)!.label}</span>
        </figcaption>
      )}
    </figure>
  );
}

export function KeyValues({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className={s.kv}>
      {items.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const consoleStyles = { list: s.list, toolbar: s.toolbar, search: s.search };
