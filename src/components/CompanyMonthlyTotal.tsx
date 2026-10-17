import { useEffect, useState } from 'react';
import PriceEstimateTable from './PriceEstimateTable';
import { loadCompanyMonthlyEstimate } from '../lib/companyMonthlyPrice';
import type { PriceEstimate } from '../lib/companySignup';
import { supabase } from '../lib/supabase';

/** Yrityksen kuukausihinta hinnaston mukaan (moduulit, huoltolajit, käyttäjät rooleittain). */
export default function CompanyMonthlyTotal({ companyId, title = 'Kuukausihinta' }: { companyId: string; title?: string }) {
  const [estimate, setEstimate] = useState<PriceEstimate | null>(null);

  useEffect(() => {
    let alive = true;
    setEstimate(null);
    void loadCompanyMonthlyEstimate(supabase, companyId)
      .then((e) => alive && setEstimate(e))
      .catch(() => alive && setEstimate(null));
    return () => {
      alive = false;
    };
  }, [companyId]);

  if (!estimate) return null;
  return <PriceEstimateTable estimate={estimate} title={title} />;
}
