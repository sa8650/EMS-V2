import type { Metadata } from 'next';
import { Bento, KeyValues, PageHeader, Tile } from '@/components/console/bento';
import { Card } from '@/components/ui/display';
import { ADDON_INFO, ADDON_KEYS } from '@/config/modules';
import { formatDate } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireShopView } from '@/server/auth/guards';
import { ShopSettingsForm } from './form';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const ctx = await requireShopView('settings');
  const ent = ctx.entitlement;
  const editable = !ctx.readOnly && can(ctx.permissions, 'settings', 'edit');
  return (
    <>
      <PageHeader title="Settings" description="Shop details printed on invoices, and the low-stock level." />
      <Bento>
        <Tile span={12} title="Licence">
          <KeyValues
            items={[
              ['Shop ID', <span key="c" className="mono">{ctx.shop.shop_code}</span>],
              ['Licence', ent ? `${ent.title} · until ${formatDate(ent.expiresAt)}` : 'No active licence'],
              ['Add-ons', ent ? ADDON_KEYS.filter((k) => ent.modules[k]).map((k) => ADDON_INFO[k].name).join(', ') || 'None' : '—'],
              ['Status', ctx.readOnly ? 'Read-only' : 'Active'],
            ]}
          />
        </Tile>
      </Bento>
      <Card title="Shop details">
        {editable ? <ShopSettingsForm shop={ctx.shop} /> : <p>You can view these settings but not change them.</p>}
      </Card>
    </>
  );
}
