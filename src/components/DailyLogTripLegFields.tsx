import { useState } from 'react';

import TripDestinationInput from './TripDestinationInput';
import { supabase } from '../lib/supabase';
import { calculateTripLegDistances } from '../lib/tripDistanceApi';
import type { TripDestinationOption } from '../lib/tripDestinations';
import {
  appendReturnTripLeg,
  emptyTripLeg,
  sumTripLegDraftKm,
  type TripLegDraft,
} from '../lib/workReportTripLegs';

type Props = {
  drafts: TripLegDraft[];
  setDrafts: (next: TripLegDraft[]) => void;
  showCustomerFields?: boolean;
  destinationOptions?: TripDestinationOption[];
};

export default function DailyLogTripLegFields({
  drafts,
  setDrafts,
  showCustomerFields,
  destinationOptions = [],
}: Props) {
  const totalKm = sumTripLegDraftKm(drafts);
  const [busy, setBusy] = useState(false);
  const [rowBusyKey, setRowBusyKey] = useState<string | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  async function calculateRows(indices: number[]) {
    if (indices.length === 0) return;
    setCalcError(null);
    const legs = indices.map((index) => ({
      from: drafts[index]?.from_label ?? '',
      to: drafts[index]?.to_label ?? '',
    }));

    const results = await calculateTripLegDistances(supabase, legs);
    const next = [...drafts];
    indices.forEach((draftIndex, resultIndex) => {
      const result = results[resultIndex];
      if (result?.distance_km != null && result.distance_km > 0 && next[draftIndex]) {
        next[draftIndex] = { ...next[draftIndex], distance_km: String(result.distance_km) };
      }
    });
    setDrafts(next);

    const firstError = results.find((r) => r.error)?.error;
    if (firstError) setCalcError(firstError);
  }

  async function calculateAll() {
    if (drafts.length === 0) return;
    setBusy(true);
    try {
      await calculateRows(drafts.map((_, index) => index));
    } catch (err) {
      setCalcError(err instanceof Error ? err.message : 'Reittilaskenta epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function calculateOne(index: number) {
    const row = drafts[index];
    if (!row) return;
    setRowBusyKey(row.key);
    setCalcError(null);
    try {
      await calculateRows([index]);
    } catch (err) {
      setCalcError(err instanceof Error ? err.message : 'Reittilaskenta epäonnistui.');
    } finally {
      setRowBusyKey(null);
    }
  }

  return (
    <div className="trip-leg-section">
      <div className="section-head">
        <h3>
          Ajomatkat
          {totalKm > 0 ? <span className="trip-leg-total"> · yhteensä {totalKm.toFixed(1)} km</span> : null}
        </h3>
        <div className="trip-leg-head-actions">
          {drafts.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || rowBusyKey != null}
              onClick={() => void calculateAll()}
            >
              {busy ? 'Lasketaan…' : 'Laske kaikki reitit'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || rowBusyKey != null}
            onClick={() => setDrafts([...drafts, emptyTripLeg()])}
          >
            + Lisää väliajo
          </button>
        </div>
      </div>
      <p className="muted trip-leg-hint">
        Lähtö tulee profiilistasi (toimipiste tai koti). Kohde ehdotetaan työraportin asiakkaan osoitteesta — voit valita
        myös tukkurin tai muun kohteen listasta. Paina <strong>Laske reitti</strong> km-laskentaan tai{' '}
        <strong>Lisää paluumatka</strong> paluulle.
      </p>
      {calcError && <p className="error trip-leg-calc-error">{calcError}</p>}
      {drafts.length === 0 ? (
        <p className="muted">Ei ajomatkoja — lisää rivi tai käytä oletusreittiä.</p>
      ) : (
        drafts.map((row, index) => {
          const rowBusy = rowBusyKey === row.key;
          return (
            <div key={row.key} className="trip-leg-row">
              <label>
                Lähtö
                <input
                  value={row.from_label}
                  onChange={(e) =>
                    setDrafts(drafts.map((r, i) => (i === index ? { ...r, from_label: e.target.value } : r)))
                  }
                  placeholder="Toimipiste tai koti"
                />
              </label>
              <TripDestinationInput
                id={`trip-to-${row.key}`}
                label="Kohde"
                value={row.to_label}
                placeholder="Asiakkaan osoite tai tukkuri"
                options={destinationOptions}
                disabled={busy || rowBusy}
                onChange={(value) =>
                  setDrafts(drafts.map((r, i) => (i === index ? { ...r, to_label: value } : r)))
                }
              />
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
              <div className="trip-leg-row-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm trip-leg-calc-btn"
                  disabled={busy || rowBusy}
                  onClick={() => void calculateOne(index)}
                >
                  {rowBusy ? '…' : 'Laske reitti'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy || rowBusy}
                  onClick={() => setDrafts(appendReturnTripLeg(drafts, index))}
                >
                  Lisää paluumatka
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy || rowBusy}
                  onClick={() => setDrafts(drafts.filter((_, i) => i !== index))}
                >
                  Poista
                </button>
              </div>
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
            </div>
          );
        })
      )}
    </div>
  );
}
