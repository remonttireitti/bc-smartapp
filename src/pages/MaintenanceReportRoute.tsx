import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { isChecklistCategory, type ChecklistCategoryKey } from '../lib/huoltoCategories';
import { supabase } from '../lib/supabase';
import ChecklistReportEditPage from './ChecklistReportEditPageLazy';
import MaintenanceReportEditPage from './MaintenanceReportEditPage';

/** /huoltoraportit/:id → kylmälomake tai tarkastuslistaraportti (LVI / IV / Sähkö) datan lajin mukaan. */
export default function MaintenanceReportRoute({ session }: { session: Session }) {
  const { id } = useParams();
  const [kind, setKind] = useState<{ id: string; category: ChecklistCategoryKey | 'kylma' } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void supabase
      .from('maintenance_reports')
      .select('category:data->>reportCategory')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const cat = (data as { category?: string | null } | null)?.category;
        setKind({ id, category: isChecklistCategory(cat) ? cat : 'kylma' });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return <MaintenanceReportEditPage session={session} />;
  if (!kind || kind.id !== id) {
    return (
      <AppLayout session={session}>
        <p className="muted">Ladataan…</p>
      </AppLayout>
    );
  }
  if (kind.category === 'kylma') return <MaintenanceReportEditPage session={session} />;
  return <ChecklistReportEditPage key={id} session={session} category={kind.category} />;
}
