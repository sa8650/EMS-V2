import type { Metadata } from 'next';
import Link from 'next/link';
import s from '../auth.module.css';
import { ResetFlow } from '../forms';

export const metadata: Metadata = { title: 'Reset password', robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <>
      <div>
        <h1 className={s.title}>Reset your password</h1>
        <p className={s.sub}>We will email a one-time code to the address on your account.</p>
      </div>
      <ResetFlow />
      <div className={s.links}>
        <Link href="/login">Back to sign in</Link>
      </div>
    </>
  );
}
