import { Inbox, LifeBuoy, ShieldCheck, Store, Users } from 'lucide-react';
import Link from 'next/link';
import { Bento, PageHeader, Tile, consoleStyles } from '@/components/console/bento';
import { ButtonLink } from '@/components/ui/button';
import { Badge, EmptyState, Stat } from '@/components/ui/display';
import { formatDate, formatMoney } from '@/lib/format';
import { requireOwner } from '@/server/auth/guards';
import { ownerOverview } from '@/server/services/overview';

export default async function OwnerOverviewPage() {
  const { db, owner } = await requireOwner();
  const o = await ownerOverview(db);
  return (
    <>
      <PageHeader title={`Welcome, ${owner.name.split(' ')[0]}`} description="What needs your attention across the platform." />
      <Bento>
        <Tile span={3} title="Administrators" icon={Users}>
          <Stat label="Registered" value={o.admins} />
        </Tile>
        <Tile span={3} title="Shops" icon={Store}>
          <Stat label="Open" value={o.shops} />
        </Tile>
        <Tile span={3} title="Licences" icon={ShieldCheck}>
          <Stat label="Active now" value={o.activeLicences} />
        </Tile>
        <Tile span={3} title="Inbox" icon={Inbox} accent>
          <Stat label="New contact messages" value={o.newMessages} note={<Link href="/owner/messages">Open inbox</Link>} />
        </Tile>

        <Tile span={4} title="Waiting for review" icon={LifeBuoy} accent>
          <ul className={consoleStyles.list}>
            <li>
              <Link href="/owner/licenses?status=pending">Licence requests</Link>
              <Badge tone={o.pendingLicences ? 'warning' : 'neutral'}>{o.pendingLicences}</Badge>
            </li>
            <li>
              <Link href="/owner/addons">Add-on requests</Link>
              <Badge tone={o.pendingAddons ? 'warning' : 'neutral'}>{o.pendingAddons}</Badge>
            </li>
            <li>
              <Link href="/owner/helpdesk">Unread help desk messages</Link>
              <Badge tone={o.unreadHelp ? 'info' : 'neutral'}>{o.unreadHelp}</Badge>
            </li>
          </ul>
        </Tile>

        <Tile span={8} title="Newest administrators" action={<ButtonLink href="/owner/administrators" size="small">All administrators</ButtonLink>}>
          {o.recentAdmins.length ? (
            <ul className={consoleStyles.list}>
              {o.recentAdmins.map((a) => (
                <li key={a.id}>
                  <span>
                    <strong>{a.name}</strong> · {a.email}
                  </span>
                  <span>
                    {!a.active && <Badge tone="danger">Inactive</Badge>} {formatDate(a.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Users} title="No administrators yet">Administrators appear here when they register.</EmptyState>
          )}
        </Tile>

        <Tile span={12} title="Latest licence requests" action={<ButtonLink href="/owner/licenses" size="small">Review licences</ButtonLink>}>
          {o.recentLicences.length ? (
            <ul className={consoleStyles.list}>
              {o.recentLicences.map((l) => (
                <li key={l.id}>
                  <span>
                    <strong>{(l as unknown as { admins: { name: string } | null }).admins?.name ?? '—'}</strong> · {l.title} · {formatMoney(l.amount)}
                  </span>
                  <span>
                    <Badge tone={l.status === 'active' ? 'success' : l.status === 'pending' ? 'warning' : 'neutral'}>{l.status}</Badge> {formatDate(l.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ShieldCheck} title="No licence requests yet" />
          )}
        </Tile>
      </Bento>
    </>
  );
}
