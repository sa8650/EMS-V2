import type { Metadata } from 'next';
import { changeOwnerPasswordAction } from '../_actions/platform';
import { FactoryResetForm } from '../_components/forms';
import { PasswordForm } from '@/app/admin/profile/forms';
import { Bento, KeyValues, PageHeader, Tile } from '@/components/console/bento';
import { Badge, Card, DataTable, EmptyState } from '@/components/ui/display';
import { requireOwner } from '@/server/auth/guards';
import { getEnv } from '@/server/env';
import { RESET_PHRASE, storageByAdmin, systemStatus } from '@/server/services/platform';

export const metadata: Metadata = { title: 'System' };

const yes = (ok: boolean, label = ok ? 'Configured' : 'Not configured') => <Badge tone={ok ? 'success' : 'warning'}>{label}</Badge>;

export default async function SystemPage() {
  const { db } = await requireOwner();
  const [s, storage] = await Promise.all([getEnv().then(systemStatus), storageByAdmin(db)]);
  return (
    <>
      <PageHeader title="System" description="How this installation is configured. Secrets are never shown." />
      <Bento>
        <Tile span={12} title="Configuration">
          <KeyValues
            items={[
              ['Database', s.database],
              ['File storage (R2 FILES)', yes(s.files)],
              ['Email (Brevo)', yes(s.email)],
              ['Workers AI', yes(s.workersAi, s.workersAi ? 'Available' : 'Not bound')],
              ['AI provider keys', s.aiKeys.length ? s.aiKeys.join(', ') : 'None'],
              ['Public address (SITE_URL)', s.siteUrl ?? 'Taken from each request'],
            ]}
          />
        </Tile>
      </Bento>
      <Card title="Vaultium storage by administrator" bodyless>
        <DataTable caption="Storage" rows={storage} rowKey={(r) => r.id} empty={<EmptyState title="No files stored yet" />} columns={[
          { key: 'admin', header: 'Administrator', cell: (r) => (r.admin ? `${r.admin.name} (${r.admin.email})` : 'Former administrator') },
          { key: 'used', header: 'Used', numeric: true, cell: (r) => `${(r.bytes / 1024 ** 2).toFixed(1)} MB` },
        ]} />
      </Card>
      <Card title="Owner password">
        <PasswordForm action={changeOwnerPasswordAction} />
      </Card>
      <Card title="Factory reset">
        <FactoryResetForm phrase={RESET_PHRASE} />
      </Card>
    </>
  );
}
