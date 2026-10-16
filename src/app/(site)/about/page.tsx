import type { Metadata } from 'next';
import { CmsPage } from '@/components/site/cms-page';

export const metadata: Metadata = { title: 'About' };

export default function Page() {
  return <CmsPage slug="about" fallbackTitle="About" />;
}
