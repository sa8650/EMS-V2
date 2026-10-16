'use client';

import { ShopFields, type ShopRecord } from '@/app/admin/shops/forms';
import { ActionForm } from '@/components/ui/form';
import { saveShopSettingsAction } from './actions';

export function ShopSettingsForm({ shop }: { shop: ShopRecord }) {
  return (
    <ActionForm action={saveShopSettingsAction} submitLabel="Save settings">
      <ShopFields shop={shop} />
    </ActionForm>
  );
}
