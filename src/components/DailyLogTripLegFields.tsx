import { useState } from 'react';

import TripDestinationInput from './TripDestinationInput';
import { supabase } from '../lib/supabase';
import { calculateTripLegDistances } from '../lib/tripDistanceApi';
import type { TripDestinationOption } from '../lib/tripDestinations';
import {
  appendReturnTripLeg,
  findReturnLegIndex,
  insertIntermediateTripLeg,
  isReturnToDepartureLeg,
  removeTripLegAt,
  sumTripLegDraftKm,
  updateTripLegDraft,
  type TripLegDraft,
} from '../lib/workReportTripLegs';
import { formatTripKmRateLabel } from '../lib/tripKmExpense';
import DailyLogFormSection from './DailyLogFormSection';

type Props = {
  drafts: TripLegDraft[];
  setDrafts: (next: TripLegDraft[]) => void;
  departureLabel: string;
  showCustomerFields?: boolean;
  destinationOptions?: TripDestinationOption[];
  tripKmRate?: number | null;
};

export default function DailyLogTripLegFields({
  drafts,
  setDrafts,
  departureLabel,
  showCustomerFields,
  destinationOptions = [],
  tripKmRate = null,
}: Props) {
  const totalKm = sumTripLegDraftKm(drafts);
  const returnLegIndex = findReturnLegIndex(drafts, departureLabel);
  const [busy, setBusy] = useState(false);
  const [rowBusyKey, setRowBusyKey] = useState<string | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  async function applyDistanceResults(nextDrafts: TripLegDraft[], indices: number[]) {
    if (indices.length === 0) return nextDrafts;

    setCalcError(null);
    const legs = indices.map((index) => ({
      from: nextDrafts[index]?.from_label ?? '',
      to: nextDrafts[index]?.to_label ?? '',
    }));

    const results = await calculateTripLegDistances(supabase, legs);
    const next = [...nextDrafts];
    indices.forEach((draftIndex, resultIndex) => {
      const result = results[resultIndex];
      if (result?.distance_km != null && result.distance_km > 0 && next[draftIndex]) {
        next[draftIndex] = { ...next[draftIndex], distance_km: String(result.distance_km) };
      }
    });

    const firstError = results.find((result) => result.error)?.error;
    if (firstError) setCalcError(firstError);
    return next;
  }

  async function calculateRows(indices: number[], baseDrafts = drafts) {
    if (indices.length === 0) return;
    setBusy(true);
    try {
      const next = await applyDistanceResults(baseDrafts, indices);
      setDrafts(next);
    } catch (err) {
      setCalcError(err instanceof Error ? err.message : 'Reittilaskenta epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function calculateAll() {
    if (drafts.length === 0) return;
    await calculateRows(drafts.map((_, index) => index));
  }

  async function calculateOne(index: number) {
    const row = drafts[index];
    if (!row) return;
    setRowBusyKey(row.key);
    try {
      await calculateRows([index]);
    } finally {
      setRowBusyKey(null);
    }
  }

  async function addReturnTrip(index: number) {
    const { drafts: nextDrafts, newLegIndex } = appendReturnTripLeg(drafts, index, departureLabel);
    if (newLegIndex < 0) return;

    setDrafts(nextDrafts);
    const newLeg = nextDrafts[newLegIndex];
    if (!newLeg) return;

    setRowBusyKey(newLeg.key);
    setBusy(true);
    try {
      const withDistance = await applyDistanceResults(nextDrafts, [newLegIndex]);
      setDrafts(withDistance);
    } catch (err) {
      setCalcError(err instanceof Error ? err.message : 'Reittilaskenta epäonnistui.');
    } finally {
      setRowBusyKey(null);
      setBusy(false);
    }
  }

  function patchLeg(index: number, patch: Partial<TripLegDraft>) {
    setDrafts(updateTripLegDraft(drafts, index, patch, departureLabel));
  }

  const sectionTitle =
    totalKm > 0 ? `Ajomatkat (${totalKm.toFixed(1)} km)` : 'Ajomatkat';

  return (
    <DailyLogFormSection title={sectionTitle} collapseKey="daily-log:trips" className="trip-leg-dialog-section">
    <div className="trip-leg-section">
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
            disabled={busy || rowBusyKey != null || !departureLabel.trim()}
            onClick={() => setDrafts(insertIntermediateTripLeg(drafts, departureLabel))}
          >
            + Lisää väliajo
          </button>
      </div>
      <p className="muted trip-leg-hint">
        Päivä alkaa aina toimipisteestä/kodista ja päättyy sinne. Kirjoita kohteeseen — ehdotukset haetaan rekisteristä.
        Paluumatka lisätään aina viimeiseksi ja km lasketaan heti.
        {formatTripKmRateLabel(tripKmRate)
          ? ` Km-korvausrivi (${formatTripKmRateLabel(tripKmRate)}) päivittyy kulut-osiossa automaattisesti.`
          : ' Aseta €/km-hinta kohdassa Hallinta → Yritys, jolloin km-korvausrivi luodaan automaattisesti.'}
      </p>
      {calcError && <p className="error trip-leg-calc-error">{calcError}</p>}
      {drafts.length === 0 ? (
        <p className="muted">Ei ajomatkoja — lisää rivi tai käytä oletusreittiä.</p>
      ) : (
        drafts.map((row, index) => {
          const rowBusy = rowBusyKey === row.key;
          const isFirstLeg = index === 0;
          const isReturnLeg = isReturnToDepartureLeg(row, departureLabel) && index === returnLegIndex;
          const canAddReturn =
            !isReturnLeg &&
            row.to_label.trim().length > 0 &&
            (returnLegIndex < 0 || index < returnLegIndex);

          return (
            <div key={row.key} className={`trip-leg-row${isReturnLeg ? ' trip-leg-row-return' : ''}`}>
              <label>
                Lähtö
                <input
                  value={row.from_label}
                  readOnly={isFirstLeg || isReturnLeg}
                  disabled={isFirstLeg || isReturnLeg || busy || rowBusy}
                  onChange={(event) => patchLeg(index, { from_label: event.target.value })}
                  placeholder="Toimipiste tai koti"
                />
              </label>
              {isReturnLeg ? (
                <label>
                  Kohde
                  <input value={row.to_label} readOnly disabled />
                </label>
              ) : (
                <TripDestinationInput
                  label="Kohde"
                  value={row.to_label}
                  placeholder="Kirjoita tai valitse kohde"
                  options={destinationOptions}
                  disabled={busy || rowBusy}
                  onChange={(value) => patchLeg(index, { to_label: value })}
                />
              )}
              <label className="trip-leg-km-field">
                km
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={row.distance_km}
                  disabled={busy || rowBusy}
                  onChange={(event) => patchLeg(index, { distance_km: event.target.value })}
                  placeholder="0"
                />
              </label>
              <div className="trip-leg-row-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy || rowBusy}
                  onClick={() => void calculateOne(index)}
                >
                  {rowBusy ? '…' : 'Laske reitti'}
                </button>
                {canAddReturn && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy || rowBusy}
                    onClick={() => void addReturnTrip(index)}
                  >
                    Lisää paluumatka
                  </button>
                )}
                {!isFirstLeg && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy || rowBusy}
                    onClick={() => setDrafts(removeTripLegAt(drafts, index, departureLabel))}
                  >
                    Poista
                  </button>
                )}
              </div>
              {showCustomerFields && (
                <label className="compact-option trip-leg-bill-check">
                  <input
                    type="checkbox"
                    checked={row.bill_to_customer}
                    disabled={busy || rowBusy}
                    onChange={(event) => patchLeg(index, { bill_to_customer: event.target.checked })}
                  />
                  Laskutetaan asiakkaalta
                </label>
              )}
            </div>
          );
        })
      )}
    </div>
    </DailyLogFormSection>
  );
}
