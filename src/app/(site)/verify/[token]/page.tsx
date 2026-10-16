import { BadgeCheck, ShieldAlert } from 'lucide-react';
import type { Metadata } from 'next';
import s from '@/components/site/site.module.css';
import { formatDate, formatMoney } from '@/lib/format';
import { requestMeta } from '@/server/auth/session';
import { getDb } from '@/server/db';
import { verifyDocument, type VerifiedDocument } from '@/server/services/verification';

export const metadata: Metadata = { title: 'Verify a document', robots: { index: false } };

const LABEL = { invoice: 'Invoice', return: 'Return', exchange: 'Exchange' } as const;

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let doc: VerifiedDocument | null = null;
  try {
    doc = await verifyDocument(await getDb(), token, await requestMeta());
  } catch {
    doc = null;
  }
  return (
    <section className={s.section}>
      <div className={`${s.container} ${s.prose}`} style={{ justifyItems: 'center', textAlign: 'center' }}>
        {doc ? (
          <>
            <BadgeCheck aria-hidden style={{ width: 56, height: 56, color: 'var(--success)' }} />
            <h1>Genuine {LABEL[doc.type].toLowerCase()}</h1>
            <p className={s.muted}>This document was issued by <strong>{doc.shop}</strong> and has not been changed.</p>
            <ul className={s.list} style={{ textAlign: 'left' }}>
              <li>{LABEL[doc.type]} number: <strong className="mono">{doc.number}</strong></li>
              <li>Date: <strong>{formatDate(doc.date)}</strong></li>
              <li>Amount: <strong>{formatMoney(doc.amount)}</strong></li>
              <li>Status: <strong>{doc.status}</strong></li>
            </ul>
          </>
        ) : (
          <>
            <ShieldAlert aria-hidden style={{ width: 56, height: 56, color: 'var(--danger)' }} />
            <h1>Not verified</h1>
            <p className={s.muted}>We could not find a document for this code. It may have been deleted, or the code is not genuine. Ask the shop for a new copy.</p>
          </>
        )}
      </div>
    </section>
  );
}
