import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import ui from '@/components/ui/ui.module.css';
import s from './console.module.css';

/**
 * Search and filters as a plain GET form (works without JavaScript; the URL is
 * shareable). `hidden` keeps other query parameters; `actions` sit on the right.
 */
export function Toolbar({ q, placeholder = 'Search', hidden = {}, filters, actions }: {
  q?: string;
  placeholder?: string;
  hidden?: Record<string, string | undefined>;
  filters?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={s.toolbar}>
      <form method="get" className={s.search} role="search">
        {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <label className="visually-hidden" htmlFor="toolbar-q">
          {placeholder}
        </label>
        <input id="toolbar-q" name="q" defaultValue={q} placeholder={placeholder} className={ui.control} type="search" />
        {filters}
        <Button type="submit" iconOnly aria-label="Search">
          <Search aria-hidden />
        </Button>
      </form>
      {actions && <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

/** Builds hrefs that keep the current filters while changing one parameter. */
export function hrefWith(base: string, params: Record<string, string | number | undefined>, change: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...change })) if (v !== undefined && v !== '' && v !== null) q.set(k, String(v));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
