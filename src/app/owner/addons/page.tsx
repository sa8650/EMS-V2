import { Puzzle } from 'lucide-react';
import type { Metadata } from 'next';
import { deleteCouponAction } from '../_actions/platform';
import { AddonDialog, CouponDialog, ReviewAddonButtons, SettingForm } from '../_components/forms';
import { PageHeader } from '@/components/console/bento';
import { ConfirmAction } from '@/components/console/confirm-action';
import { Badge, Card, DataTable, EmptyState, tableStyles, type Tone } from '@/components/ui/display';
import { TextArea } from '@/components/ui/form';
import { ADDON_INFO, type AddonKey } from '@/config/modules';
import { formatDate, formatMoney } from '@/lib/format';
import { requireOwner } from '@/server/auth/guards';
import { catalogue, checkoutInfo, coupons, ownerPurchases } from '@/server/services/addons';

export const metadata: Metadata = { title: 'Add-ons' };

const TONE: Record<string, Tone> = { pending: 'warning', active: 'success', rejected: 'danger', expired: 'neutral' };

export default async function OwnerAddonsPage() {
  const { db } = await requireOwner();
  const [items, codes, requests, paymentInfo] = await Promise.all([catalogue(db), coupons(db), ownerPurchases(db), checkoutInfo(db)]);
  return (
    <>
      <PageHeader title="Add-ons" description="What administrators can buy besides a licence, at which price, and the requests to confirm." />
      <Card title="Requests" bodyless>
        <DataTable
          caption="Add-on requests"
          rows={requests}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Puzzle} title="No requests yet" />}
          columns={[
            { key: 'admin', header: 'Administrator', cell: (r) => <><strong>{r.admins?.name ?? '—'}</strong><div className={tableStyles.muted}>{r.admins?.email}</div></> },
            { key: 'addon', header: 'Add-on', cell: (r) => `${ADDON_INFO[r.addon_key as AddonKey]?.name ?? r.addon_key} · ${r.days} days${r.addon_key === 'truebill' ? '' : ` · ${r.daily_limit}`}` },
            { key: 'amount', header: 'Payable', numeric: true, cell: (r) => <>{formatMoney(Number(r.amount) - Number(r.discount_amount))}{r.coupon_code && <div className={tableStyles.muted}>coupon {r.coupon_code}</div>}</> },
            { key: 'payment', header: 'Payment', cell: (r) => <>{r.payment_method}<div className={`${tableStyles.muted} ${tableStyles.mono}`}>{[r.payment_number, r.transaction_id].filter(Boolean).join(' · ')}</div></> },
            { key: 'status', header: 'Status', cell: (r) => <><Badge tone={TONE[r.status]}>{r.status}</Badge>{r.expires_at && <div className={tableStyles.muted}>until {formatDate(r.expires_at)}</div>}</> },
            { key: 'actions', header: <span className="visually-hidden">Actions</span>, cell: (r) => (r.status === 'pending' ? <ReviewAddonButtons id={r.id} summary={`${r.admins?.name ?? 'An administrator'} paid ${formatMoney(Number(r.amount) - Number(r.discount_amount))} (${r.payment_method}, ${r.transaction_id ?? 'no transaction ID'}).`} /> : null) },
          ]}
        />
      </Card>
      <Card title="Catalogue" bodyless>
        <DataTable
          caption="Add-on catalogue"
          rows={items}
          rowKey={(i) => i.key}
          columns={[
            { key: 'title', header: 'Add-on', cell: (i) => <><strong>{i.title}</strong> {!i.enabled && <Badge>Not offered</Badge>}</> },
            { key: 'price', header: 'Price / day / unit', numeric: true, cell: (i) => formatMoney(i.unit_price) },
            { key: 'days', header: 'Days', cell: (i) => `${i.min_days}–${i.max_days}` },
            { key: 'limit', header: 'Allowance', cell: (i) => (i.key === 'truebill' ? '—' : `${i.min_limit}–${i.max_limit}`) },
            { key: 'actions', header: <span className="visually-hidden">Actions</span>, cell: (i) => <AddonDialog item={{ ...i, unit_price: Number(i.unit_price) }} /> },
          ]}
        />
      </Card>
      <Card title="Coupons" actions={<CouponDialog />} bodyless>
        <DataTable
          caption="Coupons"
          rows={codes}
          rowKey={(c) => c.code}
          empty={<EmptyState title="No coupons" />}
          columns={[
            { key: 'code', header: 'Code', cell: (c) => <span className={tableStyles.mono}>{c.code}</span> },
            { key: 'off', header: 'Discount', numeric: true, cell: (c) => `${c.percent_off}%` },
            { key: 'expires', header: 'Expires', cell: (c) => (c.expires_at ? formatDate(c.expires_at) : 'Never') },
            { key: 'active', header: 'Status', cell: (c) => <Badge tone={c.active ? 'success' : 'neutral'}>{c.active ? 'Active' : 'Off'}</Badge> },
            { key: 'actions', header: <span className="visually-hidden">Actions</span>, cell: (c) => <ConfirmAction label="Delete" title="Delete coupon?" message={`Delete ${c.code}?`} confirmLabel="Delete" action={deleteCouponAction} fields={{ code: c.code }} /> },
          ]}
        />
      </Card>
      <Card title="Payment instructions">
        <SettingForm settingKey="addon_checkout">
          <TextArea label="Shown when administrators buy an add-on" name="payment_info" rows={4} defaultValue={paymentInfo} optional />
        </SettingForm>
      </Card>
    </>
  );
}
