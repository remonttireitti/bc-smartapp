import { lazy, Suspense, type ComponentProps } from 'react';
import type ChecklistReportEditPageType from './ChecklistReportEditPage';

const ChecklistReportEditPage = lazy(() => import('./ChecklistReportEditPage'));

/** LVI / IV / Sähkö -lomake omassa chunkissaan (pääbundle pysyy PWA-esivälimuistin rajan alla). */
export default function ChecklistReportEditPageLazy(props: ComponentProps<typeof ChecklistReportEditPageType>) {
  return (
    <Suspense fallback={<p className="muted" style={{ padding: '1rem' }}>Ladataan…</p>}>
      <ChecklistReportEditPage {...props} />
    </Suspense>
  );
}
