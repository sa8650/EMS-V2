import { Mail, MessageSquare } from 'lucide-react';
import type { Metadata } from 'next';
import { SettingForm } from '../_components/forms';
import { Bento, PageHeader, Tile } from '@/components/console/bento';
import { Alert, Card, Stat } from '@/components/ui/display';
import { CheckboxField, FormGrid, TextField } from '@/components/ui/form';
import { instantRange, today } from '@/lib/dates';
import { requireOwner } from '@/server/auth/guards';
import { getEnv } from '@/server/env';
import { getSetting } from '@/server/settings';

export const metadata: Metadata = { title: 'ConnectX' };

export default async function OwnerConnectXPage() {
  const { db } = await requireOwner();
  const env = await getEnv();
  const since = instantRange(today(), today()).start;
  const [s, emails, sms] = await Promise.all([getSetting(db, 'connectx_email'), db.from('email_messages').gte('created_at', since).count(), db.from('sms_messages').gte('created_at', since).count()]);
  return (
    <>
      <PageHeader title="ConnectX" description="The sender for shop emails and password-reset codes, and today's message volume." />
      {!env.BREVO_API_KEY && <Alert tone="warning">BREVO_API_KEY is not set on the server, so no email can be sent (including password-reset codes).</Alert>}
      <Bento>
        <Tile span={6} title="Emails today" icon={Mail} accent><Stat label="All shops" value={emails} note={s.global_daily_limit ? `Platform limit ${s.global_daily_limit}` : 'No platform limit'} /></Tile>
        <Tile span={6} title="SMS today" icon={MessageSquare}><Stat label="All shops" value={sms} note="Sent through Connect App" /></Tile>
      </Bento>
      <Card title="Email sender">
        <SettingForm settingKey="connectx_email">
          <CheckboxField label="Shops may send email" name="enabled" defaultChecked={s.enabled} />
          <FormGrid>
            <TextField label="Sender name" name="from_name" defaultValue={s.from_name} optional hint="Defaults to the product name." />
            <TextField label="Sender email" name="from_email" type="email" defaultValue={s.from_email} hint="Must be a verified sender in Brevo." />
          </FormGrid>
          <FormGrid>
            <TextField label="Reply-to" name="reply_to" type="email" defaultValue={s.reply_to} optional />
            <TextField label="Platform daily email limit" name="global_daily_limit" type="number" min="0" defaultValue={String(s.global_daily_limit)} hint="0 = no limit." />
          </FormGrid>
        </SettingForm>
      </Card>
    </>
  );
}
