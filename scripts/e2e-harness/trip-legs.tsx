// Pelkkä testikehys (ei sovelluksessa): Ajomatkat-osio samalla komponentilla kuin "Muokkaa työkirjausta" -dialogissa.
import { StrictMode, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { DailyLogSectionProvider } from '../../src/components/DailyLogSectionContext';
import DailyLogTripLegFields from '../../src/components/DailyLogTripLegFields';
import { tripLegDeparture, emptyTripLeg, type TripLegDraft } from '../../src/lib/workReportTripLegs';

function Harness() {
  const [drafts, setDrafts] = useState<TripLegDraft[]>([
    { ...emptyTripLeg(), from_label: 'Tapionpöydänkuja 6, Tuusula', to_label: 'Teollisuuskatu 1, Vaasa' },
  ]);
  return (
    <DailyLogSectionProvider dialogOpen initialOpenKey="trips">
    <DailyLogTripLegFields
      drafts={drafts}
      setDrafts={setDrafts}
      tripDeparture={tripLegDeparture('Tapionpöydänkuja 6, Tuusula')}
      tripKmRate={0.9}
    />
    </DailyLogSectionProvider>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><MemoryRouter><Harness /></MemoryRouter></StrictMode>);
