import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import s from '@/components/site/site.module.css';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } };

export default function NotFound() {
  return (
    <main className={s.page} style={{ placeItems: 'center', justifyContent: 'center' }}>
      <div className={`${s.container} ${s.heroInner}`} style={{ textAlign: 'center', justifyItems: 'center' }}>
        <span className={s.eyebrow}>404</span>
        <h1 className={s.h2}>We could not find that page</h1>
        <p className={s.muted}>The link may be old, or the page may have moved.</p>
        <div className={s.ctas}>
          <ButtonLink href="/" variant="primary">Go to the home page</ButtonLink>
          <ButtonLink href="/login">Sign in</ButtonLink>
        </div>
      </div>
    </main>
  );
}
