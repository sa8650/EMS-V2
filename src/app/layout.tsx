import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import type { CSSProperties, ReactNode } from 'react';
import { getBrand } from '@/server/brand';
import { SETTING_SCHEMAS } from '@/server/settings';
import '@/styles/tokens.css';
import '@/styles/base.css';

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    metadataBase: process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined,
    title: { default: `${brand.product_name} — ${brand.tagline}`, template: `%s · ${brand.product_name}` },
    description: `${brand.product_name} is a multi-shop management system for inventory, sales, purchases, expenses, dues and staff.`,
    applicationName: brand.product_name,
    openGraph: { type: 'website', siteName: brand.product_name },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#065f46' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0b' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [brand, store] = await Promise.all([getBrand(), cookies()]);
  const theme = store.get('ems_theme')?.value;
  // Only owner-customised colours are applied inline, so the default theme keeps its dark-mode variants.
  const defaults = SETTING_SCHEMAS.theme.parse({});
  const style = {
    ...(brand.theme.primary !== defaults.primary ? { '--brand': brand.theme.primary, '--brand-strong': brand.theme.primary } : {}),
    ...(brand.theme.accent !== defaults.accent ? { '--accent': brand.theme.accent } : {}),
  } as CSSProperties;
  return (
    <html lang="en" data-theme={theme === 'dark' || theme === 'light' ? theme : undefined} style={style}>
      <body>{children}</body>
    </html>
  );
}
