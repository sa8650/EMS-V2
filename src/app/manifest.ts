import type { MetadataRoute } from 'next';
import { getBrand } from '@/server/brand';

/** Rendered per request so it reflects the owner's branding. */
export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await getBrand();
  return {
    name: `${brand.product_name} — ${brand.tagline}`,
    short_name: brand.product_name,
    description: `${brand.product_name}: inventory, sales, purchases, expenses, dues and staff for one shop or many.`,
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    background_color: '#0a0a0b',
    theme_color: '#065f46',
    categories: ['business', 'productivity', 'finance'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
