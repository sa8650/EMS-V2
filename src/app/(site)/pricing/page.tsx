import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/display';
import s from '@/components/site/site.module.css';
import { ADDON_INFO, ADDON_KEYS } from '@/config/modules';
import { formatMoney } from '@/lib/format';
import { getDb } from '@/server/db';
import { publicPlans } from '@/server/services/website';

export const metadata: Metadata = { title: 'Licence plans', description: 'Licence plans for one shop or many, with optional add-ons.' };

async function loadPlans() {
  try {
    return await publicPlans(await getDb());
  } catch {
    return [];
  }
}

export default async function PricingPage() {
  const plans = await loadPlans();
  return (
    <section className={s.section}>
      <div className={s.container}>
        <div className={s.sectionHead}>
          <h1 className={s.h2}>Licence plans</h1>
          <p className={s.muted}>A licence covers a number of shops for a period. Licences are activated once payment is confirmed.</p>
        </div>
        {plans.length ? (
          <div className={s.plans}>
            {plans.map((p) => (
              <article key={p.id} className={s.plan}>
                <h2 className={s.tileTitle}>{p.title}</h2>
                <p className={s.price}>
                  {formatMoney(p.price)} <span>/ {p.duration_months} month{p.duration_months === 1 ? '' : 's'}</span>
                </p>
                <ul className={s.list}>
                  <li>
                    <Check aria-hidden /> Up to {p.max_shops} shop{p.max_shops === 1 ? '' : 's'}
                  </li>
                  {ADDON_KEYS.filter((k) => p.modules[k]).map((k) => (
                    <li key={k}>
                      <Check aria-hidden /> {ADDON_INFO[k].name}
                      {k === 'truebill' ? '' : ` — ${p.modules[k]} ${ADDON_INFO[k].unit}`}
                    </li>
                  ))}
                  {p.benefits.map((b) => (
                    <li key={b}>
                      <Check aria-hidden /> {b}
                    </li>
                  ))}
                </ul>
                <ButtonLink href="/register" variant="primary" block>
                  Get started
                </ButtonLink>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Plans are being prepared" action={<ButtonLink href="/contact">Contact us for a licence</ButtonLink>}>
            No plans are published yet.
          </EmptyState>
        )}
      </div>
    </section>
  );
}
