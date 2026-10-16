import type { Metadata } from 'next';
import { CmsPage } from '@/components/site/cms-page';

export const metadata: Metadata = { title: 'Privacy policy' };

export default function Page() {
  return <CmsPage slug="privacy" fallbackTitle="Privacy policy" />;
}
