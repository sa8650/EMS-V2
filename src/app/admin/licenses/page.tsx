import { Check, KeyRound } from 'lucide-react';
import type { Metadata } from 'next';
import { Bento, KeyValues, PageHeader, Tile } from '@/components/console/bento';
import { Alert, Badge, Card, DataTable, EmptyState, tableStyles, type Tone } from '@/components/ui/display';
import { ADDON_INFO, ADDON_KEYS } from '@/config/modules';
import { formatDate, formatMoney } from '@/lib/format';
import { requireAdmin } from '@/server/auth/guards';
import { currentEntitlement } from '@/server/licensing';
import { adminLicences } from '@/server/services/licences';
import { publicPlans } from '@/server/services/website';
import { RequestPlanDialog } from './forms';

export const metadata: Metadata = { title: 'Licence' };

const TONE: Record<string, Tone> = { pending: 'warning', active: 'success', rejected: 'danger', expired: 'neutral' };

export default async function AdminLicencePage() {
  const { db, admin } = await requireAdmin();
  const [ent, plans, history, details] = await Promise.all([
    currentEntitlement(db, admin.id),
    publicPlans(db),
    adminLicences(db, admin.id),
    db.from('license_plans').select('id,payment_details').eq('active', true),
  ]);
  const instructions = new Map(details.map((d) => [d.id, d.payment_details]));
  const pending = history.find((h) => h.status === 'pending');
  return (
    <>
      <PageHeader title="Licence" description="A licence keeps your shops writable. Renewals start when the current licence ends." />
      {pending && <Alert tone="info">Your request for {pending.title} ({formatMoney(pending.amount)}) is waiting for review.</Alert>}
      <Bento>
        <Tile span={12} title="Current licence" icon={KeyRound} accent>
          {ent ? (
            <KeyValues
              items={[
                ['Plan', <strong key="p">{ent.title}</strong>],
                ['Valid', `${formatDate(ent.startsAt)} – ${formatDate(ent.expiresAt)}`],
                ['Shops', String(ent.maxShops)],
                ['Add-ons', ADDON_KEYS.filter((k) => ent.modules[k]).map((k) => (k === 'truebill' ? ADDON_INFO[k].name : `${ADDON_INFO[k].name} (${ent.modules[k]} ${ADDON_INFO[k].unit})`)).join(', ') || 'None'],
              ]}
            />
          ) : (
            <p>No active licence. Choose a plan below; your shops stay read-only until it is active.</p>
          )}
        </Tile>
        {plans.map((p) => (
          <Tile key={p.id} span={4} title={p.title}>
            <p style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>
              {formatMoney(p.price)} <span className={tableStyles.muted} style={{ fontSize: 'var(--text-sm)', fontWeight: 400 }}>/ {p.duration_months} mo</span>
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--space-1)', fontSize: 'var(--text-sm)' }}>
              <li><Check aria-hidden style={{ display: 'inline', width: 14 }} /> {p.max_shops} shop{p.max_shops === 1 ? '' : 's'}</li>
              {ADDON_KEYS.filter((k) => p.modules[k]).map((k) => <li key={k}><Check aria-hidden style={{ display: 'inline', width: 14 }} /> {ADDON_INFO[k].name}</li>)}
              {p.benefits.map((b) => <li key={b}><Check aria-hidden style={{ display: 'inline', width: 14 }} /> {b}</li>)}
            </ul>
            {!pending && <RequestPlanDialog planId={p.id} title={p.title} instructions={instructions.get(p.id) ?? null} priceLabel={formatMoney(p.price)} />}
          </Tile>
        ))}
        {!plans.length && (
          <Tile span={12}>
            <EmptyState icon={KeyRound} title="No plans are available yet">Contact the platform owner through the help desk.</EmptyState>
          </Tile>
        )}
      </Bento>
      <Card title="History" bodyless>
        <DataTable
          caption="Licence history"
          rows={history}
          rowKey={(h) => h.id}
          empty={<EmptyState title="No licence requests yet" />}
          columns={[
            { key: 'plan', header: 'Plan', cell: (h) => <><strong>{h.title}</strong> <span className={tableStyles.muted}>· {h.kind}</span></> },
            { key: 'amount', header: 'Amount', numeric: true, cell: (h) => formatMoney(h.amount) },
            { key: 'requested', header: 'Requested', cell: (h) => formatDate(h.created_at) },
            { key: 'period', header: 'Period', cell: (h) => (h.starts_at ? `${formatDate(h.starts_at)} – ${formatDate(h.expires_at)}` : '—') },
            { key: 'status', header: 'Status', cell: (h) => <><Badge tone={TONE[h.status]}>{h.status}</Badge>{h.review_note && <div className={tableStyles.muted}>{h.review_note}</div>}</> },
          ]}
        />
      </Card>
    </>
  );
}
