import Link from 'next/link';
import { getDb } from '@/server/db';
import { getPage, paragraphs, type PageSlug } from '@/server/services/website';
import s from './site.module.css';

/** A website page written by the owner (About, Terms, Privacy). Text only — never rendered as HTML. */
export async function CmsPage({ slug, fallbackTitle }: { slug: PageSlug; fallbackTitle: string }) {
  let page: Awaited<ReturnType<typeof getPage>> = null;
  try {
    page = await getPage(await getDb(), slug);
  } catch {
    page = null;
  }
  return (
    <section className={s.section}>
      <article className={`${s.container} ${s.prose}`}>
        <h1>{page?.title ?? fallbackTitle}</h1>
        {page ? (
          <>
            {paragraphs(page.body).map((p, i) => (
              <p key={i} style={{ whiteSpace: 'pre-line' }}>
                {p}
              </p>
            ))}
          </>
        ) : (
          <p className={s.muted}>
            This page has not been published yet. If you have a question, please <Link href="/contact">contact us</Link>.
          </p>
        )}
      </article>
    </section>
  );
}
