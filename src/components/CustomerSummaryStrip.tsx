import { Link } from 'react-router-dom';
import type { CustomerLinkedDocument } from '../lib/customerDocuments';

/** Sama kuin työraporttilistan yhteenveto: valmis/laskutettu ei ole avoinna. */
const OPEN_WORK = new Set(['scheduled', 'in_progress']);

export function summarizeCustomerDocuments(documents: CustomerLinkedDocument[]) {
  const by = (k: CustomerLinkedDocument['kind']) => documents.filter((d) => d.kind === k);
  const work = by('work_report');
  const maint = by('maintenance_report');
  const latest = maint.reduce<CustomerLinkedDocument | null>(
    (best, d) => (!best || new Date(d.date) > new Date(best.date) ? d : best),
    null,
  );
  return {
    work: work.length,
    openWork: work.filter((d) => OPEN_WORK.has(String(d.status ?? ''))).length,
    maintenance: maint.length,
    quotes: by('quote_request').length,
    latestMaintenance: latest,
  };
}

/** Tiivis yhteenvetorivi asiakkaan / laitteen sivun yläosaan. */
export default function CustomerSummaryStrip({
  equipmentCount,
  documents,
}: {
  equipmentCount?: number;
  documents: CustomerLinkedDocument[];
}) {
  const s = summarizeCustomerDocuments(documents);
  return (
    <div className="customer-summary-strip" aria-label="Yhteenveto">
      {equipmentCount != null ? <span><strong>{equipmentCount}</strong> laitetta</span> : null}
      <span><strong>{s.work}</strong> työraporttia{s.openWork > 0 ? <em> ({s.openWork} avoinna)</em> : null}</span>
      <span><strong>{s.maintenance}</strong> huoltoraporttia</span>
      <span><strong>{s.quotes}</strong> tarjousta</span>
      <span>
        Viimeisin huolto{' '}
        {s.latestMaintenance ? (
          <Link to={s.latestMaintenance.href}><strong>{new Date(s.latestMaintenance.date).toLocaleDateString('fi-FI')}</strong></Link>
        ) : (
          <strong>—</strong>
        )}
      </span>
    </div>
  );
}
