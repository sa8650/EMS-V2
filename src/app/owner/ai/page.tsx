import type { Metadata } from 'next';
import { SettingForm } from '../_components/forms';
import { PageHeader } from '@/components/console/bento';
import { Badge, Card } from '@/components/ui/display';
import { CheckboxField, FormGrid, SelectField, TextField } from '@/components/ui/form';
import { AI_PROVIDERS, aiConfigured } from '@/server/ai';
import { requireOwner } from '@/server/auth/guards';
import { getEnv } from '@/server/env';
import { getSetting } from '@/server/settings';

export const metadata: Metadata = { title: 'AI settings' };

const MODELS = Object.entries(AI_PROVIDERS).map(([value, p]) => ({ value, label: p.name }));

export default async function AiSettingsPage() {
  const { db } = await requireOwner();
  const env = await getEnv();
  const [zudo, health] = await Promise.all([getSetting(db, 'zudo'), getSetting(db, 'business_health')]);
  const block = (key: 'zudo' | 'business_health', title: string, s: typeof zudo) => (
    <Card title={title} actions={<Badge tone={aiConfigured(env, s.model) ? 'success' : 'warning'}>{aiConfigured(env, s.model) ? 'Provider ready' : 'Provider key missing'}</Badge>}>
      <SettingForm settingKey={key}>
        <CheckboxField label="Enabled" name="enabled" defaultChecked={s.enabled} />
        <FormGrid>
          <SelectField label="Model" name="model" options={MODELS} defaultValue={s.model} />
          <TextField label="Platform-wide daily limit" name="global_daily_limit" type="number" min="0" defaultValue={String(s.global_daily_limit)} hint="0 = no platform limit (shop allowances still apply)." />
        </FormGrid>
      </SettingForm>
    </Card>
  );
  return (
    <>
      <PageHeader title="AI settings" description="Which AI model answers Zudo questions and writes Business Health advice. Provider keys are server secrets (see .env.example); Cloudflare models use Workers AI." />
      {block('zudo', 'Zudo AI', zudo)}
      {block('business_health', 'AI Business Health', health)}
    </>
  );
}
