import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { leaveShopAction } from '@/app/admin/actions';
import { ConsoleFrame } from '@/components/console/frame';
import { buttonClass } from '@/components/ui/button';
import { Alert } from '@/components/ui/display';
import { navFor } from '@/config/modules';
import { can } from '@/lib/permissions';
import { readOnlyMessage, requireShop } from '@/server/auth/guards';
import { getBrand } from '@/server/brand';

export const metadata: Metadata = { title: { default: 'Shop', template: '%s · Shop' }, robots: { index: false } };

export default async function ShopLayout({ children }: { children: ReactNode }) {
  const [ctx, brand] = await Promise.all([requireShop(), getBrand()]);
  const groups = navFor('shop', (item) => !item.section || can(ctx.permissions, item.section, 'view'));
  return (
    <ConsoleFrame
      scope="shop"
      base="/shop"
      productName={brand.product_name}
      groups={groups}
      account={{ name: ctx.actor.name, role: ctx.actor.type === 'admin' ? 'Administrator' : 'Staff' }}
      context={
        <>
          <strong>{ctx.shop.name}</strong>
          <span>· Shop ID {ctx.shop.shop_code}</span>
        </>
      }
      accountActions={
        ctx.actor.type === 'admin' ? (
          <form action={leaveShopAction}>
            <button type="submit" className={buttonClass({ size: 'small' })}>
              Back to administrator
            </button>
          </form>
        ) : null
      }
      banner={ctx.readOnly ? <Alert tone="warning">{readOnlyMessage(ctx.readOnlyReason)}</Alert> : null}
    >
      {children}
    </ConsoleFrame>
  );
}
