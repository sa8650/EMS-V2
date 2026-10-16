import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import Link from 'next/link';
import type { Note } from '@/server/services/attention';
import s from './console.module.css';

const ICON = { critical: OctagonAlert, warning: AlertTriangle, info: Info };

/** Items that need attention, most urgent first; an all-clear message when empty. */
export function AttentionList({ notes }: { notes: Note[] }) {
  if (!notes.length) {
    return (
      <p className={s.allClear}>
        <CheckCircle2 aria-hidden /> Nothing needs your attention right now.
      </p>
    );
  }
  const order = { critical: 0, warning: 1, info: 2 };
  return (
    <ul className={s.notes}>
      {[...notes].sort((a, b) => order[a.level] - order[b.level]).map((n) => {
        const Icon = ICON[n.level];
        return (
          <li key={n.key} data-level={n.level}>
            <Icon aria-hidden />
            <Link href={n.href}>
              <strong>{n.title}</strong>
              {n.detail && <span>{n.detail}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
