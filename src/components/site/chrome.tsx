import { Menu } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import type { Brand } from '@/server/brand';
import s from './site.module.css';

const NAV = [
  { href: '/#features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

export function SiteHeader({ brand }: { brand: Brand }) {
  return (
    <header className={s.header}>
      <div className={`${s.container} ${s.headerInner}`}>
        <Link href="/" className={s.logo}>
          <Image src="/icon.svg" alt="" width={32} height={32} priority />
          {brand.product_name}
        </Link>
        <nav className={s.nav} aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={s.navLink}>
              {n.label}
            </Link>
          ))}
          <span className={s.navActions}>
            <ButtonLink href="/login" variant="ghost">
              Sign in
            </ButtonLink>
            <ButtonLink href="/register" variant="primary">
              Get started
            </ButtonLink>
          </span>
        </nav>
        <details className={s.menu}>
          <summary aria-label="Menu">
            <Menu aria-hidden />
          </summary>
          <div className={s.menuPanel}>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={s.navLink}>
                {n.label}
              </Link>
            ))}
            <ButtonLink href="/login">Sign in</ButtonLink>
            <ButtonLink href="/register" variant="primary">
              Get started
            </ButtonLink>
          </div>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter({ brand }: { brand: Brand }) {
  return (
    <footer className={s.footer}>
      <div className={`${s.container} ${s.footerInner}`}>
        <span>
          © {new Date().getFullYear()} {brand.product_name}
          {brand.powered_by ? ` · Powered by ${brand.powered_by}` : ''}
        </span>
        <nav className={s.footerLinks} aria-label="Footer">
          <Link href="/about">About</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/apps">Apps</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}
