import { useEffect, useMemo, useState } from 'react';

import type { WorkReportDailyLog } from '../types';
import { supabase } from '../lib/supabase';
import { formatEuro } from '../lib/workReportBilling';
import {
  parseBillingQuoteSettings,
  saveBillingQuoteDeviceActuals,
  type BillingQuotePurchaseLine,
  type BillingQuoteSettings,
  type DeviceActualCorrection,
} from '../lib/workReportBillingQuote';
import { mergeActualPurchaseFromWorkReportLogs } from '../lib/quoteRequestActualPurchaseSync';
import { collectDeviceEntries, deviceEntriesReplaceQuoteDevice } from '../lib/workReportDeviceEntries';
import { expenseBillingModeShortLabel } from '../lib/workReportExpenseBilling';

export const WORK_REPORT_DEVICE_SECTION_ID = 'work-report-device-section';

export type DeviceEntryPrefill = { description: string; unitPrice: number | null };

type Props = {
  workReportId: string;
  billingQuoteSettings: BillingQuoteSettings;
  dailyLogs: WorkReportDailyLog[];
  /** Tarjouspyynnön laitehinta (hankinta) näkyy — sama näkyvyys kuin Tarjous ja kate -osiolla. */
  showQuoteDevice: boolean;
  /** Saa oikaista tarjouspyynnön laitteen toteutuneen hankinnan. */
  canCorrect: boolean;
  /** Näytä kirjattujen laitteiden hinnat. */
  showPrices: boolean;
  /** Saa lisätä työkirjauksia (Lisää laite). */
  canAddEntries: boolean;
  onAddDevice: (prefill: DeviceEntryPrefill | null) => void;
  onEditLog: (logId: string) => void;
  onSaved: (settings: BillingQuoteSettings) => void;
};

function parseMoneyInput(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function moneyInput(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',');
}

function formatDate(value: string): string {
  const [y, m, d] = value.split('-');
  return y && m && d ? `${Number(d)}.${Number(m)}.${y}` : value;
}

/**
 * Työraportin Laite-osio: tarjouspyynnön laite (esitäytetty hinta + oikaisu) ja työkirjauksiin
 * kirjatut laitteet (kulurivin tyyppi Laite). Yksi totuus: kirjattu laite korvaa tarjouspyynnön
 * hinnan ja oikaisun, joten laite vähennetään katteesta vain kerran.
 */
export default function WorkReportDeviceSection({
  workReportId,
  billingQuoteSettings,
  dailyLogs,
  showQuoteDevice,
  canCorrect,
  showPrices,
  canAddEntries,
  onAddDevice,
  onEditLog,
  onSaved,
}: Props) {
  const settings = useMemo(() => parseBillingQuoteSettings(billingQuoteSettings), [billingQuoteSettings]);
  const quoteId = settings.quote_request_id?.trim() || null;
  const [quoteData, setQuoteData] = useState<unknown>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!quoteId || !showQuoteDevice) {
      setQuoteData(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from('quote_requests')
      .select('data')
      .eq('id', quoteId)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setQuoteData(data.data);
      });
    return () => {
      cancelled = true;
    };
  }, [quoteId, showQuoteDevice]);

  const effective = useMemo(
    () => mergeActualPurchaseFromWorkReportLogs(settings, dailyLogs, quoteData),
    [settings, dailyLogs, quoteData],
  );
  // Tarjouspyynnön laitteen oma toteutunut (esitäytetty / oikaistu), ilman laitekirjausten korvausta.
  const quoteDeviceLines: BillingQuotePurchaseLine[] = useMemo(() => {
    if (!quoteId || !showQuoteDevice) return [];
    return (mergeActualPurchaseFromWorkReportLogs(settings, [], quoteData).purchase_lines ?? []).filter(
      (line) => line.source === 'device',
    );
  }, [quoteId, showQuoteDevice, settings, quoteData]);
  const entries = useMemo(() => collectDeviceEntries(dailyLogs), [dailyLogs]);
  const replaced = deviceEntriesReplaceQuoteDevice(dailyLogs);
  const corrected = quoteDeviceLines.some((line) => line.actual_corrected);

  if (!canAddEntries && entries.length === 0 && quoteDeviceLines.length === 0) return null;

  function dirtyCorrections(): DeviceActualCorrection[] | null {
    const corrections: DeviceActualCorrection[] = [];
    for (const line of quoteDeviceLines) {
      const raw = drafts[line.id];
      if (raw == null) continue;
      const parsed = parseMoneyInput(raw);
      if (parsed == null || parsed < 0) return null;
      if (Math.abs(parsed - line.actual_purchase_net) < 0.005) continue;
      corrections.push({ line, actualNet: parsed });
    }
    return corrections;
  }

  async function saveCorrections(corrections: DeviceActualCorrection[]) {
    if (corrections.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const next = await saveBillingQuoteDeviceActuals(
        supabase,
        workReportId,
        corrections,
        effective.purchase_lines,
      );
      setDrafts({});
      onSaved(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Laitteen hinnan tallennus epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  function renderCorrectionEditor() {
    if (!canCorrect || replaced || quoteDeviceLines.length === 0) return null;
    const hasDrafts = Object.keys(drafts).length > 0;
    const corrections = dirtyCorrections();
    const invalid = corrections == null;
    return (
      <details
        className="quote-outcome-commission-edit quote-outcome-device-edit"
        open={editOpen || hasDrafts}
        onToggle={(e) => setEditOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>{corrected ? 'Laitteen hankinta oikaistu · muokkaa' : 'Oikaise laitteen hankinta'}</summary>
        <p className="muted quote-outcome-commission-note">
          Jos laite maksoi eri summan kuin tarjouspyynnössä, kirjaa tähän todellinen hankintahinta
          (alv 0 %). Oikaisu säilyy, vaikka tarjous päivittyy tai kohdistetaan uudelleen samaan
          tarjoukseen.
        </p>
        {quoteDeviceLines.map((line) => (
          <div className="quote-outcome-commission-fields" key={line.id}>
            <label className="form-field quote-outcome-device-field">
              <span>
                {line.label} · tarjouspyyntö {formatEuro(line.quote_purchase_net)}
              </span>
              <input
                type="text"
                inputMode="decimal"
                aria-label={`${line.label}: toteutunut hankinta (alv 0 %)`}
                value={drafts[line.id] ?? moneyInput(line.actual_purchase_net)}
                disabled={busy}
                onChange={(e) => {
                  const raw = e.target.value;
                  setDrafts((prev) => ({ ...prev, [line.id]: raw }));
                }}
              />
            </label>
            {line.actual_corrected ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={() => void saveCorrections([{ line, actualNet: null }])}
              >
                Palauta tarjouspyynnön hinta
              </button>
            ) : null}
          </div>
        ))}
        {invalid ? (
          <p className="error quote-outcome-commission-note">Anna hinta numerona (esim. 1180,50).</p>
        ) : null}
        {hasDrafts ? (
          <div className="quote-outcome-commission-fields">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || invalid || corrections.length === 0}
              onClick={() => corrections && void saveCorrections(corrections)}
            >
              {busy ? 'Tallennetaan…' : 'Tallenna laitteen hinta'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setDrafts({})}>
              Peruuta
            </button>
          </div>
        ) : null}
      </details>
    );
  }

  return (
    <section id={WORK_REPORT_DEVICE_SECTION_ID} className="panel work-report-section work-report-device-section">
      <div className="work-report-device-head">
        <h2>Laite</h2>
        {canAddEntries ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAddDevice(null)}>
            + Lisää laite
          </button>
        ) : null}
      </div>
      <p className="muted work-report-device-intro">
        Hankittu tai asiakkaalle myyty laite: nimi / malli, hankintahinta, asiakashinta ja kuka laitteen osti.
        {showQuoteDevice && quoteId ? ' Näkyy Tarjous ja kate -vertailussa rivillä Laite.' : ''}
      </p>

      {quoteDeviceLines.length > 0 ? (
        <div className="work-report-device-block">
          <h3>Tarjouspyynnön laite</h3>
          <ul className="work-report-device-list">
            {quoteDeviceLines.map((line) => (
              <li key={line.id}>
                <div className="work-report-device-text">
                  <strong>{line.label}</strong>
                  <span className="muted"> · tarjouspyyntö {formatEuro(line.quote_purchase_net)}</span>
                  <span className="work-report-device-sub">
                    {replaced ? (
                      <span className="muted">Korvattu työkirjaukseen kirjatulla laitteella (alla).</span>
                    ) : (
                      <>
                        Toteutunut hankinta <strong>{formatEuro(line.actual_purchase_net)}</strong>
                        <span className="muted">
                          {line.actual_corrected ? ' · oikaistu' : ' · tarjouspyynnön hinta'}
                        </span>
                      </>
                    )}
                  </span>
                </div>
                {canAddEntries && !replaced ? (
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() =>
                      onAddDevice({ description: line.label.replace(/^Laite:\s*/i, ''), unitPrice: line.actual_purchase_net })
                    }
                  >
                    Kirjaa työkirjaukseen
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {renderCorrectionEditor()}
          <p className="muted work-report-device-note">
            {replaced
              ? 'Toteutunut tulee työkirjauksiin kirjatuista laitteista. Tarjouspyynnön hinta ja oikaisu eivät ole käytössä, ennen kuin laitekirjaukset poistetaan.'
              : 'Toteutunut on esitäytetty tarjouspyynnön hinnalla. Oikaise hinta tai kirjaa laite työkirjaukseen — kirjattu laite korvaa tarjouspyynnön hinnan (laite lasketaan vain kerran).'}
          </p>
        </div>
      ) : null}

      {entries.length > 0 ? (
        <div className="work-report-device-block">
          {quoteDeviceLines.length > 0 ? <h3>Työkirjauksiin kirjatut laitteet</h3> : null}
          <ul className="work-report-device-list">
            {entries.map((entry) => {
              const meta = [
                showPrices && entry.purchaseNet != null ? `hankinta ${formatEuro(entry.purchaseNet)}` : '',
                showPrices && entry.customerNet != null ? `asiakashinta ${formatEuro(entry.customerNet)}` : '',
                expenseBillingModeShortLabel(entry.billingMode),
                entry.extraBilled ? 'lisälaskutus (lisälaite)' : '',
              ].filter(Boolean);
              return (
                <li key={entry.id}>
                  <div className="work-report-device-text">
                    <strong>{entry.description}</strong>
                    <span className="muted">
                      {' · '}
                      {formatDate(entry.logDate)}
                      {entry.qty !== 1 ? ` · ${entry.qty.toLocaleString('fi-FI')} kpl` : ''}
                    </span>
                    <span className="work-report-device-sub muted">{meta.join(' · ')}</span>
                  </div>
                  <button type="button" className="btn-link" onClick={() => onEditLog(entry.logId)}>
                    Muokkaa
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : quoteDeviceLines.length === 0 ? (
        <p className="muted">Ei kirjattuja laitteita.</p>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
