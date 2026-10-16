'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/display';

/** Shown when a page fails to render; the message stays generic (details are logged on the server). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '60dvh', padding: 'var(--space-6)' }}>
      <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: 480 }}>
        <h1 style={{ fontSize: 'var(--text-xl)' }}>Something went wrong</h1>
        <Alert tone="danger">
          This page could not be loaded. Please try again{error.digest ? ` (reference ${error.digest})` : ''}.
        </Alert>
        <div>
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
    </main>
  );
}
