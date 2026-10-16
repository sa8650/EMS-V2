import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/ui/display';
import { ownerExists } from '@/server/auth/accounts';
import { getDb } from '@/server/db';
import s from '../auth.module.css';
import { SetupForm } from '../forms';

export const metadata: Metadata = { title: 'Platform setup', robots: { index: false } };

export default async function SetupPage() {
  let done = true;
  let problem = '';
  try {
    done = await ownerExists(await getDb());
  } catch (e) {
    problem = e instanceof Error ? e.message : 'The database is not ready.';
  }
  return (
    <div className={s.card}>
      <div>
        <h1 className={s.title}>Platform setup</h1>
        <p className={s.sub}>Create the platform owner account. This is possible only once.</p>
      </div>
      {problem ? (
        <Alert tone="danger">{problem}</Alert>
      ) : done ? (
        <>
          <Alert tone="info">The platform owner has already been set up.</Alert>
          <Link href="/login?as=owner">Go to owner sign in</Link>
        </>
      ) : (
        <SetupForm />
      )}
    </div>
  );
}
