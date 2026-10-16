import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getBrand } from '@/server/brand';
import s from './auth.module.css';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const brand = await getBrand();
  return (
    <main className={s.shell}>
      <div className={s.panel}>
        <Link href="/" className={s.brand}>
          <Image src="/icon.svg" alt="" width={36} height={36} priority />
          {brand.product_name}
        </Link>
        {children}
        <p className={s.footnote}>
          {brand.powered_by ? `Powered by ${brand.powered_by} · ` : ''}
          <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link>
        </p>
      </div>
    </main>
  );
}
