import type { Metadata } from 'next';
import Link from 'next/link';
import s from '../auth.module.css';
import { RegisterForm } from '../forms';

export const metadata: Metadata = { title: 'Create an administrator account' };

export default function RegisterPage() {
  return (
    <div className={s.card}>
      <div>
        <h1 className={s.title}>Create your account</h1>
        <p className={s.sub}>As an administrator you own shops, choose a licence and add staff.</p>
      </div>
      <RegisterForm />
      <div className={s.links}>
        <span>
          Already registered? <Link href="/login?as=admin">Sign in</Link>
        </span>
      </div>
    </div>
  );
}
