import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import s from './ui.module.css';

type Variant = 'default' | 'primary' | 'danger' | 'ghost';

interface Look {
  variant?: Variant;
  size?: 'default' | 'small';
  block?: boolean;
  /** Icon-only button: `label` becomes the accessible name. */
  iconOnly?: boolean;
}

export function buttonClass({ variant = 'default', size = 'default', block, iconOnly }: Look = {}): string {
  return [s.button, variant !== 'default' && s[variant], size === 'small' && s.small, block && s.block, iconOnly && s.iconOnly]
    .filter(Boolean)
    .join(' ');
}

export function Button({ variant, size, block, iconOnly, className, type = 'button', ...rest }: Look & ComponentProps<'button'>) {
  return <button type={type} className={[buttonClass({ variant, size, block, iconOnly }), className].filter(Boolean).join(' ')} {...rest} />;
}

export function ButtonLink({ variant, size, block, iconOnly, className, children, ...rest }: Look & ComponentProps<typeof Link> & { children: ReactNode }) {
  return (
    <Link className={[buttonClass({ variant, size, block, iconOnly }), className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Link>
  );
}
