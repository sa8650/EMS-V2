import { Skeleton } from '@/components/ui/display';
import { Bento, Tile } from './bento';

/** Skeleton for console pages while their data loads. */
export function ConsoleLoading() {
  return (
    <div aria-busy="true" aria-live="polite" style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <span className="visually-hidden">Loading…</span>
      <Skeleton width="220px" height="1.75rem" />
      <Bento>
        {[0, 1, 2, 3].map((i) => (
          <Tile key={i} span={3}>
            <Skeleton width="40%" />
            <Skeleton width="70%" height="2rem" />
          </Tile>
        ))}
        <Tile span={8}>
          <Skeleton height="160px" />
        </Tile>
        <Tile span={4}>
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </Tile>
      </Bento>
    </div>
  );
}
