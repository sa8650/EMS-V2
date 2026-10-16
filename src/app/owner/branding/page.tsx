import type { Metadata } from 'next';
import { SettingForm } from '../_components/forms';
import { PageHeader } from '@/components/console/bento';
import { Card } from '@/components/ui/display';
import { FormGrid, TextField } from '@/components/ui/form';
import { requireOwner } from '@/server/auth/guards';
import { getSetting } from '@/server/settings';

export const metadata: Metadata = { title: 'Branding' };

export default async function BrandingPage() {
  const { db } = await requireOwner();
  const [b, t] = await Promise.all([getSetting(db, 'branding'), getSetting(db, 'theme')]);
  return (
    <>
      <PageHeader title="Branding" description="The product name, tagline and colours used on the website, sign-in pages, consoles and emails." />
      <Card title="Name and contact">
        <SettingForm settingKey="branding">
          <FormGrid>
            <TextField label="Product name" name="product_name" defaultValue={b.product_name} />
            <TextField label="Powered by" name="powered_by" defaultValue={b.powered_by} optional />
          </FormGrid>
          <TextField label="Tagline" name="tagline" defaultValue={b.tagline} />
          <FormGrid>
            <TextField label="Support email" name="support_email" type="email" defaultValue={b.support_email} optional />
            <TextField label="Support phone" name="support_phone" type="tel" defaultValue={b.support_phone} optional />
          </FormGrid>
        </SettingForm>
      </Card>
      <Card title="Colours">
        <SettingForm settingKey="theme">
          <FormGrid>
            <TextField label="Brand colour" name="primary" type="color" defaultValue={t.primary} hint="Buttons, links and highlights." />
            <TextField label="Accent colour" name="accent" type="color" defaultValue={t.accent} />
          </FormGrid>
        </SettingForm>
      </Card>
    </>
  );
}
