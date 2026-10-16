import { Stethoscope } from 'lucide-react';
import type { Metadata } from 'next';
import { Bento, PageHeader, Tile } from '@/components/console/bento';
import { Alert, Badge, Card, EmptyState, Stat } from '@/components/ui/display';
import { addDays, today } from '@/lib/dates';
import { formatDate, formatDateTime } from '@/lib/format';
import { requireShopView } from '@/server/auth/guards';
import { getEnv } from '@/server/env';
import { aiStatus, healthReports } from '@/server/services/ai-addons';
import { ReportForm } from './report-form';

export const metadata: Metadata = { title: 'Business Health' };

const tone = (score: number) => (score >= 75 ? 'success' : score >= 50 ? 'warning' : 'danger');

export default async function HealthPage() {
  const ctx = await requireShopView('report');
  const [status, reports] = await Promise.all([aiStatus(ctx.db, await getEnv(), ctx.shop, 'business_health'), healthReports(ctx.db, ctx.shop.id)]);
  const latest = reports[0];
  return (
    <>
      <PageHeader title="AI Business Health" description="A health score for any period, with the reasons and practical advice." />
      {!status.active && <Alert tone="info">AI Business Health is not active for this shop. It comes with some licence plans or as an add-on.</Alert>}
      {status.active && !status.configured && <Alert tone="warning">The AI provider is not configured yet. The platform owner needs to set it up.</Alert>}
      <Bento>
        {latest && (
          <Tile span={4} title="Latest score" icon={Stethoscope} accent>
            <Stat label={`${formatDate(latest.start_date)} – ${formatDate(latest.end_date)}`} value={<Badge tone={tone(latest.score)}>{latest.score} / 100</Badge>} />
          </Tile>
        )}
        {status.active && status.configured && !ctx.readOnly && (
          <Tile span={latest ? 8 : 12} title={`New report (${status.used} of ${status.limit} used today)`}>
            <ReportForm from={addDays(today(), -29)} to={today()} />
          </Tile>
        )}
      </Bento>
      {reports.length ? reports.map((r) => (
        <Card key={r.id} title={`${formatDate(r.start_date)} – ${formatDate(r.end_date)}`} actions={<Badge tone={tone(r.score)}>{r.score} / 100</Badge>}>
          {Array.isArray((r.snapshot as { findings?: string[] }).findings) && (
            <ul>{((r.snapshot as { findings: string[] }).findings).map((f) => <li key={f}>{f}</li>)}</ul>
          )}
          <p style={{ whiteSpace: 'pre-wrap', marginTop: 'var(--space-3)' }}>{r.insights}</p>
          <p style={{ color: 'var(--text-subtle)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}>Created {formatDateTime(r.created_at)}</p>
        </Card>
      )) : <Card><EmptyState icon={Stethoscope} title="No reports yet" /></Card>}
    </>
  );
}
