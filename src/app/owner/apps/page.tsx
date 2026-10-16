import { Smartphone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/console/bento';
import { ConfirmAction } from '@/components/console/confirm-action';
import { Alert, Badge, Card, DataTable, EmptyState, tableStyles } from '@/components/ui/display';
import { formatDate } from '@/lib/format';
import { requireOwner } from '@/server/auth/guards';
import { getEnv } from '@/server/env';
import { allApps, releaseStatus } from '@/server/services/app-store';
import { deleteAppAction } from './actions';
import { AppDialog } from './forms';

export const metadata: Metadata = { title: 'App Store' };

export default async function OwnerAppsPage() {
  const { db } = await requireOwner();
  const env = await getEnv();
  const apps = await allApps(db);
  const ready = new Map(await Promise.all(apps.map(async (a) => [a.id, (await releaseStatus(env, a)).available] as const)));
  return (
    <>
      <PageHeader title="App Store" description="Android apps offered on the public Apps page. Installed apps check here for updates." actions={<AppDialog />} />
      {!env.FILES && <Alert tone="info">File storage (R2 FILES) is not set up, so APKs must be published by download link.</Alert>}
      <Card bodyless>
        <DataTable caption="Apps" rows={apps} rowKey={(a) => a.id} empty={<EmptyState icon={Smartphone} title="No apps yet" />} columns={[
          { key: 'title', header: 'App', cell: (a) => <><strong>{a.title}</strong><div className={tableStyles.muted}>{a.package_name}</div></> },
          { key: 'version', header: 'Version', cell: (a) => `${a.version} (${a.version_code})` },
          { key: 'file', header: 'Download', cell: (a) => (ready.get(a.id) ? <Badge tone="success">Available</Badge> : <Badge tone="warning">No APK</Badge>) },
          { key: 'status', header: 'Status', cell: (a) => <>{a.published ? <Badge tone="success">Published</Badge> : <Badge>Hidden</Badge>} {a.mandatory && <Badge tone="warning">Required</Badge>}</> },
          { key: 'updated', header: 'Updated', cell: (a) => formatDate(a.updated_at) },
          { key: 'actions', header: <span className="visually-hidden">Actions</span>, cell: (a) => <span style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end', alignItems: 'center' }}>{a.published && <Link href="/apps" target="_blank">View</Link>}<AppDialog app={a} /><ConfirmAction label="Delete" title="Delete app?" message={`Delete ${a.title} and its files?`} confirmLabel="Delete" action={deleteAppAction} fields={{ id: a.id }} /></span> },
        ]} />
      </Card>
    </>
  );
}
