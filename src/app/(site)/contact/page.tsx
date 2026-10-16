import type { Metadata } from 'next';
import s from '@/components/site/site.module.css';
import { getBrand } from '@/server/brand';
import { getDb } from '@/server/db';
import { getPage, paragraphs } from '@/server/services/website';
import { ContactForm } from './contact-form';

export const metadata: Metadata = { title: 'Contact', description: 'Questions about licences, add-ons or getting started? Send us a message.' };

export default async function ContactPage() {
  const brand = await getBrand();
  let intro: string[] = [];
  try {
    const page = await getPage(await getDb(), 'contact');
    intro = page ? paragraphs(page.body) : [];
  } catch {
    intro = [];
  }
  return (
    <section className={s.section}>
      <div className={`${s.container} ${s.split}`}>
        <div className={s.prose}>
          <h1>Contact us</h1>
          {intro.length ? intro.map((p, i) => <p key={i}>{p}</p>) : <p className={s.muted}>Questions about licences, add-ons or getting started? We read every message.</p>}
          {(brand.support_email || brand.support_phone) && (
            <ul className={s.list}>
              {brand.support_email && (
                <li>
                  Email: <a href={`mailto:${brand.support_email}`}>{brand.support_email}</a>
                </li>
              )}
              {brand.support_phone && (
                <li>
                  Phone: <a href={`tel:${brand.support_phone}`}>{brand.support_phone}</a>
                </li>
              )}
            </ul>
          )}
        </div>
        <ContactForm />
      </div>
    </section>
  );
}
