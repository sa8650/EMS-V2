import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ConsoleFrame } from '@/components/console/frame';
import { navFor } from '@/config/modules';
import { requireOwner } from '@/server/auth/guards';
import { getBrand } from '@/server/brand';

export const metadata: Metadata = { title: { default: 'Owner console', template: '%s · Owner console' }, robots: { index: false } };

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const [{ owner }, brand] = await Promise.all([requireOwner(), getBrand()]);
  return (
    <ConsoleFrame scope="owner" base="/owner" productName={brand.product_name} groups={navFor('owner')} account={{ name: owner.name, role: owner.email }} context={<strong>Platform</strong>}>
      {children}
    </ConsoleFrame>
  );
}
