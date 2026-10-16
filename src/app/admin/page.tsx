import Link from 'next/link';
import { BellRing, KeyRound, LifeBuoy, Store } from 'lucide-react';
import { enterShopAction } from './actions';
import { Bento, KeyValues, PageHeader, Tile, consoleStyles } from '@/components/console/bento';
import { Button, ButtonLink } from '@/components/ui/button';
import { Badge, EmptyState, Stat } from '@/components/ui/display';
import { ADDON_INFO, ADDON_KEYS } from '@/config/modules';
import { formatDate } from '@/lib/format';
import { requireAdmin } from '@/server/auth/guards';
import { adminAttention } from '@/server/services/attention';
import { adminOverview } from '@/server/services/overview';
import { AttentionList } from '@/components/console/attention';

export default async function AdminOverviewPage() {
  const { db, admin } = await requireAdmin();
  const [o, notes] = await Promise.all([adminOverview(db, admin.id), adminAttention(db, admin.id)]);
  const ent = o.entitlement;
  return (
    <>
      <PageHeader
        title={`Hello, ${admin.name.split(' ')[0]}`}
        description="Your licence, your shops and anything waiting for you."
        actions={<ButtonLink href="/admin/shops" variant="primary">Manage shops</ButtonLink>}
      />
      <Bento>
        <Tile span={5} title="Licence" icon={KeyRound} accent action={<ButtonLink href="/admin/licenses" size="small">{ent ? 'Renew or upgrade' : 'Choose a plan'}</ButtonLink>}>
          {ent ? (
            <KeyValues
              items={[
                ['Plan', <strong key="p">{ent.title}</strong>],
                ['Valid until', formatDate(ent.expiresAt)],
                ['Shops included', `${o.shops.length} of ${ent.maxShops} in use`],
                ['Add-ons', ADDON_KEYS.filter((k) => ent.modules[k]).map((k) => ADDON_INFO[k].name).join(', ') || 'None'],
              ]}
            />
          ) : (
            <p>
              No active licence. Your shops stay read-only until a licence is active.
              {o.pendingLicences ? ' Your request is waiting for review.' : ''}
            </p>
          )}
        </Tile>
        <Tile span={3} title="Shops" icon={Store}>
          <Stat label="Open" value={o.shops.length} note={ent ? `${Math.max(0, ent.maxShops - o.shops.length)} more allowed` : 'Needs a licence'} />
        </Tile>
        <Tile span={4} title="Help desk" icon={LifeBuoy}>
          <Stat label="Unread replies" value={o.unreadHelp} note={<Link href="/admin/helpdesk">Open help desk</Link>} />
        </Tile>
        <Tile span={12} title="Needs attention" icon={BellRing}>
          <AttentionList notes={notes} />
        </Tile>
        <Tile span={12} title="Your shops" flush>
          {o.shops.length ? (
            <ul className={consoleStyles.list} style={{ padding: '0 var(--space-5)' }}>
              {o.shops.map((s) => (
                <li key={s.id}>
                  <span>
                    <strong>{s.name}</strong> · Shop ID <span className="mono">{s.shop_code}</span> · {s.category}
                  </span>
                  <span style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    {!s.active && <Badge tone="danger">Deactivated</Badge>}
                    {s.active && s.readOnly && <Badge tone="warning">Read-only</Badge>}
                    <form action={enterShopAction}>
                      <input type="hidden" name="shopId" value={s.id} />
                      <Button type="submit" size="small">Open shop</Button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Store} title="No shops yet" action={<ButtonLink href="/admin/shops" variant="primary">Create your first shop</ButtonLink>}>
              Each shop gets its own Shop ID, staff and records.
            </EmptyState>
          )}
        </Tile>
      </Bento>
    </>
  );
}
