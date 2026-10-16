'use client';

import { LogOut, Menu, SunMoon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { signOutAction } from '@/app/(auth)/actions';
import type { ConsoleScope, NavGroup } from '@/config/modules';
import { buttonClass } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import s from './console.module.css';

const SCOPE_LABEL: Record<ConsoleScope, string> = { owner: 'Owner console', admin: 'Administrator', shop: 'Shop console' };

export interface FrameProps {
  scope: ConsoleScope;
  base: string;
  productName: string;
  groups: NavGroup[];
  account: { name: string; role: string };
  context?: ReactNode;
  accountActions?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}

export function ConsoleFrame({ scope, base, productName, groups, account, context, accountActions, banner, children }: FrameProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isCurrent = (slug: string) => {
    const href = slug ? `${base}/${slug}` : base;
    return slug ? pathname === href || pathname.startsWith(`${href}/`) : pathname === href;
  };

  return (
    <div className={s.console} data-scope={scope} data-open={open}>
      <aside className={s.sidebar} aria-label="Console navigation">
        <Link href={base} className={s.brand}>
          <Image src="/icon.svg" alt="" width={32} height={32} />
          <span>
            <span className={s.brandName}>{productName}</span>
            <span className={s.scopeLabel}>{SCOPE_LABEL[scope]}</span>
          </span>
        </Link>
        <nav className={s.nav}>
          {groups.map((g) => (
            <div key={g.title} className={s.group}>
              <p className={s.groupTitle}>{g.title}</p>
              {g.items.map((item) => (
                <Link key={item.slug} href={item.slug ? `${base}/${item.slug}` : base} className={s.link} aria-current={isCurrent(item.slug) ? 'page' : undefined} onClick={() => setOpen(false)}>
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className={s.account}>
          <div>
            <p className={s.accountName}>{account.name}</p>
            <p className={s.accountRole}>{account.role}</p>
          </div>
          <div className={s.accountActions}>
            {accountActions}
            <form action={signOutAction}>
              <button type="submit" className={buttonClass({ size: 'small', variant: 'ghost' })}>
                <LogOut aria-hidden /> Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
      {open && <div className={s.scrim} onClick={() => setOpen(false)} aria-hidden />}
      <div className={s.main}>
        <header className={s.topbar}>
          <button type="button" className={`${buttonClass({ variant: 'ghost', iconOnly: true })} ${s.menuButton}`} aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu aria-hidden />
          </button>
          <div className={s.context}>{context}</div>
          <span className={s.spacer} />
          <ThemeToggle />
        </header>
        {banner && <div className={s.banner}>{banner}</div>}
        <main id="main" className={s.content}>
          {children}
        </main>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    root.dataset.theme = next;
    document.cookie = `ems_theme=${next}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <button type="button" className={buttonClass({ variant: 'ghost', iconOnly: true })} onClick={toggle} aria-label="Switch light or dark theme">
      <SunMoon aria-hidden />
    </button>
  );
}
