import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Tabs } from '@/components/ui/display';
import s from '../auth.module.css';
import { SignInForm, type SignInMode } from '../forms';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

const REASONS: Record<string, string> = {
  inactive: 'Your account is not active. Contact your administrator.',
  'shop-inactive': 'This shop has been deactivated by its administrator.',
  'shop-missing': 'That shop no longer exists.',
};

const TITLES: Record<SignInMode, { title: string; sub: string }> = {
  staff: { title: 'Shop sign in', sub: 'Use your Shop ID and user ID.' },
  admin: { title: 'Administrator sign in', sub: 'Manage your shops, licences and staff.' },
  owner: { title: 'Platform owner sign in', sub: 'For the people who run this platform.' },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ as?: string; reason?: string }> }) {
  const { as, reason } = await searchParams;
  const mode: SignInMode = as === 'admin' || as === 'owner' ? as : 'staff';
  return (
    <>
      <Tabs
        label="Account type"
        current={mode}
        items={[
          { key: 'staff', href: '/login', label: 'Shop staff' },
          { key: 'admin', href: '/login?as=admin', label: 'Administrator' },
          { key: 'owner', href: '/login?as=owner', label: 'Owner' },
        ]}
      />
      <div className={s.card}>
        <div>
          <h1 className={s.title}>{TITLES[mode].title}</h1>
          <p className={s.sub}>{TITLES[mode].sub}</p>
        </div>
        {reason && REASONS[reason] && <Alert tone="warning">{REASONS[reason]}</Alert>}
        <SignInForm mode={mode} />
        <div className={s.links}>
          <Link href="/forgot-password">Forgot password?</Link>
          {mode === 'admin' && <Link href="/register">Create an account</Link>}
          {mode === 'owner' && <Link href="/setup">First-time setup</Link>}
        </div>
      </div>
    </>
  );
}
