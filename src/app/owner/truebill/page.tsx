import { QrCode } from 'lucide-react';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/console/bento';
import { Card, DataTable, EmptyState, tableStyles } from '@/components/ui/display';
import { formatDateTime } from '@/lib/format';
import { requireOwner } from '@/server/auth/guards';
import { recentScans } from '@/server/services/verification';

export const metadata: Metadata = { title: 'TrueBill scans' };

export default async function TrueBillPage() {
  const { db } = await requireOwner();
  const scans = await recentScans(db);
  return (
    <>
      <PageHeader title="TrueBill scans" description="Every time someone scans a document's QR code to verify it." />
      <Card bodyless>
        <DataTable
          caption="Verification scans"
          rows={scans}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={QrCode} title="No scans yet" />}
          columns={[
            { key: 'when', header: 'When', cell: (r) => formatDateTime(r.scanned_at) },
            { key: 'shop', header: 'Shop', cell: (r) => r.shops?.name ?? '—' },
            { key: 'doc', header: 'Document', cell: (r) => <>{r.document_type} <span className={tableStyles.mono}>{r.document_number}</span></> },
            { key: 'ip', header: 'From', cell: (r) => <span className={tableStyles.muted}>{r.ip ?? '—'}</span> },
          ]}
        />
      </Card>
    </>
  );
}
