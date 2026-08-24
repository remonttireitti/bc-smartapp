import { useState } from 'react';

import TripDestinationInput from './TripDestinationInput';
import { TripLegBillingPanel } from './TripLegBillingPanel';
import { supabase } from '../lib/supabase';
import { calculateTripLegDistances } from '../lib/tripDistanceApi';
import type { TripDestinationOption } from '../lib/tripDestinations';
import type { ExpenseBillingMode } from '../lib/workReportExpenseBilling';
import {
  appendReturnTripLeg,
  findReturnLegIndex,
  insertIntermediateTripLeg,
  isReturnToDepartureLeg,
  removeTripLegAt,
  sumTripLegDraftKm,
  updateTripLegDraft,
  type TripLegDeparture,
  type TripLegDraft,
} from '../lib/workReportTripLegs';
import { formatTripKmRateLabel } from '../lib/tripKmExpense';
import {
  DAILY_LOG_SECTION_COLORS,
  dailyLogTripsSubtitle,
} from '../lib/dailyLogSectionHelpers';
import DailyLogTileSection from './DailyLogTileSection';

type Props = {
  drafts: TripLegDraft[];
  setDrafts: (next: TripLegDraft[]) => void;
  tripDeparture: TripLegDeparture;
  showPartnerBilling?: boolean;
  showCustomerBilling?: boolean;
  tripBillingMode?: ExpenseBillingMode;
  onTripBillingModeChange?: (mode: ExpenseBillingMode) => void;
  destinationOptions?: TripDestinationOption[];
  tripKmRate?: number | null;
};

export default function DailyLogTripLegFields({
  drafts,
  setDrafts,
  tripDeparture,
  showPartnerBilling = false,
  showCustomerBilling = false,
  tripBillingMode = 'partner_and_customer',
  onTripBillingModeChange,
  destinationOptions = [],
  tripKmRate = null,
}: Props) {
  const { returnLabel } = tripDeparture;
  const totalKm = sumTripLegDraftKm(drafts);
  const returnLegIndex = findReturnLegIndex(drafts, tripDeparture);
  const effectiveReturnLabel = drafts[0]?.from_label?.trim() || returnLabel;
  const [busy, setBusy] = useState(false);
  const [rowBusyKey, setRowBusyKey] = useState<string | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const showBillingPanel = totalKm > 0 && !!onTripBillingModeChange;
  const rateLabel = formatTripKmRateLabel(tripKmRate);

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
    const { drafts: nextDrafts, newLegIndex } = appendReturnTripLeg(drafts, index, tripDeparture);
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
    setDrafts(updateTripLegDraft(drafts, index, patch, tripDeparture));
  }

  const sectionTitle = 'Ajomatkat';

  return (
    <DailyLogTileSection
      sectionKey="trips"
      title={sectionTitle}
      subtitle={dailyLogTripsSubtitle(drafts)}
      color={DAILY_LOG_SECTION_COLORS.trips}
      wide
    >
      <div className="trip-leg-section">
        <div className="trip-leg-toolbar">
          <div className="trip-leg-toolbar-actions">
            {drafts.length > 0 ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy || rowBusyKey != null}
                onClick={() => void calculateAll()}
              >
                {busy ? 'Lasketaan…' : 'Laske kaikki reitit'}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || rowBusyKey != null || !effectiveReturnLabel.trim()}
              onClick={() => setDrafts(insertIntermediateTripLeg(drafts, tripDeparture))}
            >
              Lisää väliajo
            </button>
          </div>
          {totalKm > 0 ? (
            <div className="trip-leg-toolbar-meta">
              <span className="trip-leg-total">{totalKm.toFixed(1)} km yhteensä</span>
              {rateLabel ? <span className="muted">{rateLabel}</span> : null}
            </div>
          ) : null}
        </div>

        {showBillingPanel && onTripBillingModeChange ? (
          <TripLegBillingPanel
            mode={tripBillingMode}
            onChange={onTripBillingModeChange}
            showPartnerBilling={showPartnerBilling}
            showCustomerBilling={showCustomerBilling}
            disabled={busy || rowBusyKey != null}
          />
        ) : null}

        <p className="muted trip-leg-hint">
          Ajomatka on valinnainen — jätä tyhjäksi jos et käytä autoa tai et halua km-korvausta.
          Voit laskea matkan lähtöpisteestä kohteeseen tai syöttää kilometrit käsin.
          {rateLabel
            ? ` Km-korvaus (${rateLabel}) lasketaan automaattisesti täytetyistä matkoista.`
            : ' Aseta €/km-hinta kohdassa Hallinta → Yritys.'}
        </p>
        {calcError ? <p className="error trip-leg-calc-error">{calcError}</p> : null}

        {drafts.length === 0 ? (
          <p className="muted">Ei ajomatkoja — lisää matka vain jos haluat km-korvauksen.</p>
        ) : (
          drafts.map((row, index) => {
            const rowBusy = rowBusyKey === row.key;
            const isFirstLeg = index === 0;
            const isReturnLeg = isReturnToDepartureLeg(row, effectiveReturnLabel) && index === returnLegIndex;
            const canAddReturn =
              !isReturnLeg &&
              row.to_label.trim().length > 0 &&
              (returnLegIndex < 0 || index < returnLegIndex);

            return (
              <div key={row.key} className={`trip-leg-row${isReturnLeg ? ' trip-leg-row-return' : ''}`}>
                {isFirstLeg ? (
                  <TripDestinationInput
                    label="Lähtö"
                    value={row.from_label}
                    placeholder="Kirjoita tai valitse lähtö"
                    options={destinationOptions}
                    disabled={busy || rowBusy}
                    onChange={(value) => patchLeg(index, { from_label: value })}
                  />
                ) : (
                  <label>
                    Lähtö
                    <input value={row.from_label} readOnly disabled placeholder="Edellinen kohde" />
                  </label>
                )}
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
                  {canAddReturn ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy || rowBusy}
                      onClick={() => void addReturnTrip(index)}
                    >
                      Paluu
                    </button>
                  ) : null}
                  {!isFirstLeg ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy || rowBusy}
                      onClick={() => setDrafts(removeTripLegAt(drafts, index, tripDeparture))}
                    >
                      Poista
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </DailyLogTileSection>
  );
}
