import { Puzzle } from 'lucide-react';
import type { Metadata } from 'next';
import { Bento, PageHeader, Tile } from '@/components/console/bento';
import { Badge, Card, DataTable, EmptyState, tableStyles, type Tone } from '@/components/ui/display';
import { ADDON_INFO, ADDON_KEYS, type AddonKey } from '@/config/modules';
import { formatDate, formatMoney } from '@/lib/format';
import { requireAdmin } from '@/server/auth/guards';
import { addonAllowance } from '@/server/licensing';
import { adminPurchases, catalogue, checkoutInfo, usageToday } from '@/server/services/addons';
import { BuyAddonDialog } from './forms';

export const metadata: Metadata = { title: 'Add-ons' };

const TONE: Record<string, Tone> = { pending: 'warning', active: 'success', rejected: 'danger', expired: 'neutral' };

export default async function AdminAddonsPage() {
  const { db, admin } = await requireAdmin();
  const [items, history, paymentInfo, usage, ...allowances] = await Promise.all([
    catalogue(db), adminPurchases(db, admin.id), checkoutInfo(db), usageToday(db, admin.id), ...ADDON_KEYS.map((k) => addonAllowance(db, admin.id, k)),
  ]);
  const allowance = new Map(ADDON_KEYS.map((k, i) => [k, allowances[i]]));
  const enabled = items.filter((i) => i.enabled);
  return (
    <>
      <PageHeader title="Add-ons" description="Extra services for all your shops, from your licence or bought for the days you need." />
      <Bento>
        {enabled.length ? enabled.map((i) => {
          const a = allowance.get(i.key as AddonKey);
          return (
            <Tile key={i.key} span={4} title={i.title} icon={Puzzle} accent={!!a}>
              {i.details && <p className={tableStyles.muted}>{i.details}</p>}
              <p>{formatMoney(i.unit_price)} per day{i.key === 'truebill' ? '' : ` per ${ADDON_INFO[i.key as AddonKey].unit.replace(' per day', '')}`}</p>
              {a ? <Badge tone="success">Active{a.expiresAt ? ` until ${formatDate(a.expiresAt)}` : ''}{i.key === 'truebill' ? '' : ` · ${a.limit} ${ADDON_INFO[i.key as AddonKey].unit}`}</Badge> : (
                <BuyAddonDialog paymentInfo={paymentInfo} offer={{ key: i.key, title: i.title, unit_price: Number(i.unit_price), min_days: i.min_days, max_days: i.max_days, min_limit: i.min_limit, max_limit: i.max_limit, unit: ADDON_INFO[i.key as AddonKey].unit }} />
              )}
            </Tile>
          );
        }) : (
          <Tile span={12}><EmptyState icon={Puzzle} title="No add-ons are offered yet" /></Tile>
        )}
      </Bento>
      <Card title="Usage today" bodyless>
        <DataTable
          caption="Add-on usage today"
          rows={usage}
          rowKey={(u) => u.id}
          empty={<EmptyState title="No shops yet" />}
          columns={[
            { key: 'shop', header: 'Shop', cell: (u) => u.name },
            { key: 'connectx', header: `ConnectX${allowance.get('connectx') ? ` (of ${allowance.get('connectx')!.limit})` : ''}`, numeric: true, cell: (u) => u.connectx },
            { key: 'zudo', header: `Zudo${allowance.get('zudo') ? ` (of ${allowance.get('zudo')!.limit})` : ''}`, numeric: true, cell: (u) => u.zudo },
            { key: 'health', header: `Health reports${allowance.get('business_health') ? ` (of ${allowance.get('business_health')!.limit})` : ''}`, numeric: true, cell: (u) => u.health },
          ]}
        />
      </Card>
      <Card title="Requests" bodyless>
        <DataTable
          caption="Add-on requests"
          rows={history}
          rowKey={(h) => h.id}
          empty={<EmptyState title="No add-on requests yet" />}
          columns={[
            { key: 'addon', header: 'Add-on', cell: (h) => ADDON_INFO[h.addon_key as AddonKey]?.name ?? h.addon_key },
            { key: 'days', header: 'Days', numeric: true, cell: (h) => h.days },
            { key: 'amount', header: 'Amount', numeric: true, cell: (h) => formatMoney(Number(h.amount) - Number(h.discount_amount)) },
            { key: 'period', header: 'Period', cell: (h) => (h.starts_at ? `${formatDate(h.starts_at)} – ${formatDate(h.expires_at)}` : formatDate(h.created_at)) },
            { key: 'status', header: 'Status', cell: (h) => <Badge tone={TONE[h.status]}>{h.status}</Badge> },
          ]}
        />
      </Card>
    </>
  );
}
