import type { Metadata } from 'next';
import { PageHeader } from '@/components/console/bento';
import { HelpdeskThread } from '@/components/console/helpdesk';
import { Card } from '@/components/ui/display';
import { requireAdmin } from '@/server/auth/guards';
import { conversation } from '@/server/services/platform';
import { sendAdminMessageAction } from '../_actions/account';

export const metadata: Metadata = { title: 'Help desk' };

export default async function AdminHelpdeskPage() {
  const { db, admin } = await requireAdmin();
  const messages = await conversation(db, admin.id, 'admin');
  return (
    <>
      <PageHeader title="Help desk" description="Questions about licences, payments or the system? The platform owner replies here." />
      <Card>
        <HelpdeskThread messages={messages} viewer="admin" action={sendAdminMessageAction} />
      </Card>
    </>
  );
}
