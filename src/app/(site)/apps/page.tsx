import { Download, Smartphone } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { ButtonLink } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/display';
import s from '@/components/site/site.module.css';
import { formatDate } from '@/lib/format';
import { getDb } from '@/server/db';
import { getEnv } from '@/server/env';
import { downloadPath, iconUrl, publishedApps, releaseStatus } from '@/server/services/app-store';

export const metadata: Metadata = { title: 'Apps', description: 'Android apps that work with your shops.' };

async function load() {
  try {
    const [db, env] = await Promise.all([getDb(), getEnv()]);
    const apps = await publishedApps(db);
    return await Promise.all(apps.map(async (a) => ({ ...a, icon: iconUrl(a), downloadable: (await releaseStatus(env, a)).available })));
  } catch {
    return [];
  }
}

export default async function AppsPage() {
  const apps = await load();
  return (
    <section className={s.section}>
      <div className={s.container}>
        <div className={s.sectionHead}>
          <h1 className={s.h2}>Apps</h1>
          <p className={s.muted}>Android apps that work with your shops, such as Connect App for sending SMS from your own phone.</p>
        </div>
        {apps.length ? (
          <div className={s.plans}>
            {apps.map((a) => (
              <article key={a.id} className={s.plan}>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                  {a.icon ? <Image src={a.icon} alt="" width={48} height={48} style={{ borderRadius: 12 }} /> : <Smartphone aria-hidden />}
                  <div>
                    <h2 className={s.tileTitle}>{a.title}</h2>
                    <p className={s.proseMeta}>
                      Version {a.version} · {formatDate(a.updated_at)}
                    </p>
                  </div>
                </div>
                {a.description && <p className={s.tileText}>{a.description}</p>}
                {a.mandatory && <Badge tone="warning">Required update</Badge>}
                {a.downloadable ? (
                  <ButtonLink href={downloadPath(a.package_name)} variant="primary" prefetch={false}>
                    <Download aria-hidden /> Download APK
                  </ButtonLink>
                ) : (
                  <p className={s.muted}>The download will be available soon.</p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={Smartphone} title="No apps published yet" />
        )}
      </div>
    </section>
  );
}
