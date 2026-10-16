import { Laptop } from 'lucide-react';
import type { Metadata } from 'next';
import { forgetDeviceAction } from '../_actions/account';
import { PageHeader } from '@/components/console/bento';
import { ConfirmAction } from '@/components/console/confirm-action';
import { Card, DataTable, EmptyState, tableStyles } from '@/components/ui/display';
import { formatDateTime } from '@/lib/format';
import { requireAdmin } from '@/server/auth/guards';
import { adminDevices } from '@/server/services/platform';

export const metadata: Metadata = { title: 'Devices' };

/** Short "browser on system" label from a user-agent string. */
function deviceLabel(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const system = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'another system';
  return `${browser} on ${system}`;
}

export default async function DevicesPage() {
  const { db, admin } = await requireAdmin();
  const devices = await adminDevices(db, admin.id);
  return (
    <>
      <PageHeader title="Devices" description="Browsers that signed in to your shops. Unknown devices may mean a shared or leaked password." />
      <Card bodyless>
        <DataTable
          caption="Devices"
          rows={devices}
          rowKey={(d) => d.id}
          empty={<EmptyState icon={Laptop} title="No sign-ins yet" />}
          columns={[
            { key: 'device', header: 'Device', cell: (d) => <><strong>{deviceLabel(d.user_agent)}</strong><div className={tableStyles.muted}>{d.user_agent?.slice(0, 80)}</div></> },
            { key: 'shop', header: 'Shop', cell: (d) => d.shop },
            { key: 'who', header: 'Signed in as', cell: (d) => (d.staff ? `${d.staff.full_name} (${d.staff.user_id})` : 'Administrator') },
            { key: 'seen', header: 'Last seen', cell: (d) => formatDateTime(d.last_seen_at) },
            { key: 'actions', header: <span className="visually-hidden">Actions</span>, cell: (d) => <ConfirmAction label="Remove" title="Remove device?" message="Remove this device from the list? It reappears if it signs in again." confirmLabel="Remove" action={forgetDeviceAction} fields={{ id: d.id }} /> },
          ]}
        />
      </Card>
    </>
  );
}
