import type { Metadata } from 'next';
import { Bento, KeyValues, PageHeader, Tile } from '@/components/console/bento';
import { Card } from '@/components/ui/display';
import { formatDate } from '@/lib/format';
import { requireAdmin } from '@/server/auth/guards';
import { PasswordForm, ProfileForm } from './forms';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const { admin } = await requireAdmin();
  return (
    <>
      <PageHeader title="Profile" />
      <Bento>
        <Tile span={12} title="Account">
          <KeyValues items={[['Email', admin.email], ['Admin code', <span key="c" className="mono">{admin.admin_code}</span>], ['Member since', formatDate(admin.created_at)]]} />
        </Tile>
      </Bento>
      <Card title="Details">
        <ProfileForm name={admin.name} phone={admin.phone} address={admin.address} />
      </Card>
      <Card title="Password">
        <PasswordForm />
      </Card>
    </>
  );
}
