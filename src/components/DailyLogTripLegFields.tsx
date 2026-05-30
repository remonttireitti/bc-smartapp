import {
  emptyTripLeg,
  sumTripLegDraftKm,
  type TripLegDraft,
} from '../lib/workReportTripLegs';

type Props = {
  drafts: TripLegDraft[];
  setDrafts: (next: TripLegDraft[]) => void;
  showCustomerFields?: boolean;
};

export default function DailyLogTripLegFields({ drafts, setDrafts, showCustomerFields }: Props) {
  const totalKm = sumTripLegDraftKm(drafts);

  return (
    <div className="trip-leg-section">
      <div className="section-head">
        <h3>
          Ajomatkat
          {totalKm > 0 ? <span className="trip-leg-total"> · yhteensä {totalKm.toFixed(1)} km</span> : null}
        </h3>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setDrafts([...drafts, emptyTripLeg()])}
        >
          + Lisää väliajo
        </button>
      </div>
      <p className="muted trip-leg-hint">
        Kirjaa reitti pätkittäin: toimisto → kohde, mahdolliset väliajot (esim. tukkuri) ja paluu. Kilometrit syötetään
        käsin toistaiseksi.
      </p>
      {drafts.length === 0 ? (
        <p className="muted">Ei ajomatkoja — lisää rivi tai käytä oletusreittiä.</p>
      ) : (
        drafts.map((row, index) => (
          <div key={row.key} className="trip-leg-row">
            <label>
              Lähtö
              <input
                value={row.from_label}
                onChange={(e) =>
                  setDrafts(drafts.map((r, i) => (i === index ? { ...r, from_label: e.target.value } : r)))
                }
                placeholder="Esim. Toimisto"
              />
            </label>
            <label>
              Kohde
              <input
                value={row.to_label}
                onChange={(e) =>
                  setDrafts(drafts.map((r, i) => (i === index ? { ...r, to_label: e.target.value } : r)))
                }
                placeholder="Esim. työkohde"
              />
            </label>
            <label>
              km
              <input
                type="number"
                step="0.1"
                min="0"
                value={row.distance_km}
                onChange={(e) =>
                  setDrafts(drafts.map((r, i) => (i === index ? { ...r, distance_km: e.target.value } : r)))
                }
                placeholder="0"
              />
            </label>
            {showCustomerFields && (
              <label className="compact-option trip-leg-bill-check">
                <input
                  type="checkbox"
                  checked={row.bill_to_customer}
                  onChange={(e) =>
                    setDrafts(
                      drafts.map((r, i) => (i === index ? { ...r, bill_to_customer: e.target.checked } : r)),
                    )
                  }
                />
                Laskutetaan asiakkaalta
              </label>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setDrafts(drafts.filter((_, i) => i !== index))}
            >
              Poista
            </button>
          </div>
        ))
      )}
    </div>
  );
}
