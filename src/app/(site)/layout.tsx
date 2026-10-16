import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '@/components/site/chrome';
import s from '@/components/site/site.module.css';
import { getBrand } from '@/server/brand';

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const brand = await getBrand();
  return (
    <div className={s.page}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader brand={brand} />
      <main id="main" className={s.main}>
        {children}
      </main>
      <SiteFooter brand={brand} />
    </div>
  );
}
