import type { Metadata } from 'next';
import { CmsPage } from '@/components/site/cms-page';

export const metadata: Metadata = { title: 'Terms of service' };

export default function Page() {
  return <CmsPage slug="terms" fallbackTitle="Terms of service" />;
}
