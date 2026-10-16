import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ConsoleFrame } from '@/components/console/frame';
import { navFor } from '@/config/modules';
import { requireAdmin } from '@/server/auth/guards';
import { getBrand } from '@/server/brand';

export const metadata: Metadata = { title: { default: 'Administrator', template: '%s · Administrator' }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [{ admin }, brand] = await Promise.all([requireAdmin(), getBrand()]);
  return (
    <ConsoleFrame
      scope="admin"
      base="/admin"
      productName={brand.product_name}
      groups={navFor('admin')}
      account={{ name: admin.name, role: `Admin code ${admin.admin_code}` }}
      context={<strong>{admin.name}</strong>}
    >
      {children}
    </ConsoleFrame>
  );
}
