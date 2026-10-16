'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <Button onClick={() => window.print()}>
      <Printer aria-hidden /> {label}
    </Button>
  );
}
