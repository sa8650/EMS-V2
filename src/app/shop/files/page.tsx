import { FileStack } from 'lucide-react';
import type { Metadata } from 'next';
import { Bento, PageHeader, Tile } from '@/components/console/bento';
import { ConfirmAction } from '@/components/console/confirm-action';
import { Toolbar } from '@/components/console/toolbar';
import { Alert, Card, DataTable, EmptyState, Stat, tableStyles } from '@/components/ui/display';
import { formatDate, formatDateTime } from '@/lib/format';
import { can } from '@/lib/permissions';
import { requireShopView } from '@/server/auth/guards';
import { getEnv } from '@/server/env';
import { INLINE_SAFE, listFiles, storageUsage } from '@/server/services/vaultium';
import { deleteFileAction } from './actions';
import { UploadForm } from './upload-form';

export const metadata: Metadata = { title: 'Vaultium' };

const size = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

export default async function FilesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const ctx = await requireShopView('vaultium');
  const env = await getEnv();
  const [usage, files] = await Promise.all([storageUsage(ctx.db, ctx.shop.admin_id, env), listFiles(ctx.db, ctx.shop.id, q)]);
  const canAdd = !ctx.readOnly && !!usage.allowance && usage.storageReady && can(ctx.permissions, 'vaultium', 'add');
  return (
    <>
      <PageHeader title="Vaultium" description="Receipts, bills and documents, kept with the invoices and expenses they belong to." />
      {!usage.allowance && <Alert tone="info">Vaultium is not active for this shop. The administrator can add it through a licence plan or as an add-on.</Alert>}
      {usage.allowance && !usage.storageReady && <Alert tone="warning">File storage is not set up on this server (R2 bucket binding FILES).</Alert>}
      <Bento>
        <Tile span={4} title="Storage" icon={FileStack} accent>
          <Stat label="Used" value={size(usage.usedBytes)} note={usage.allowance ? `of ${usage.allowance.limit} GB${usage.allowance.expiresAt ? ` · until ${formatDate(usage.allowance.expiresAt)}` : ''}` : 'No allowance'} />
        </Tile>
        {canAdd && (
          <Tile span={8} title="Upload">
            <UploadForm />
          </Tile>
        )}
      </Bento>
      <Card bodyless>
        <Toolbar q={q} placeholder="Search file names" />
        <DataTable
          caption="Files"
          rows={files}
          rowKey={(f) => f.id}
          empty={<EmptyState icon={FileStack} title={q ? 'No matching files' : 'No files yet'} />}
          columns={[
            { key: 'name', header: 'File', cell: (f) => <><strong>{f.filename}</strong><div className={tableStyles.muted}>{size(Number(f.size_bytes))}</div></> },
            { key: 'record', header: 'Attached to', cell: (f) => (f.invoices ? <span className={tableStyles.mono}>{f.invoices.number}</span> : f.expenses ? <span className={tableStyles.mono}>{f.expenses.code}</span> : <span className={tableStyles.muted}>—</span>) },
            { key: 'when', header: 'Uploaded', cell: (f) => formatDateTime(f.created_at) },
            {
              key: 'actions',
              header: <span className="visually-hidden">Actions</span>,
              cell: (f) => (
                <span style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {INLINE_SAFE.test(f.content_type) && <a href={`/api/files/${f.id}?view=1`} target="_blank" rel="noopener">View</a>}
                  <a href={`/api/files/${f.id}`}>Download</a>
                  {!ctx.readOnly && can(ctx.permissions, 'vaultium', 'delete') && <ConfirmAction label="Delete" title="Delete file?" message={`Delete ${f.filename}?`} confirmLabel="Delete" action={deleteFileAction} fields={{ id: f.id }} />}
                </span>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
