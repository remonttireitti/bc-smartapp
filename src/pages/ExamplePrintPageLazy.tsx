import { lazy, Suspense } from 'react';

const ExamplePrintPage = lazy(() => import('./ExamplePrintPage'));

export default function ExamplePrintPageLazy() {
  return (
    <Suspense fallback={<p className="muted" style={{ padding: '1rem' }}>Ladataan…</p>}>
      <ExamplePrintPage />
    </Suspense>
  );
}
