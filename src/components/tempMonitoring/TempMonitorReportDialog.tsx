import { FormEvent, useEffect, useMemo } from 'react';
import type { TempMonitorSession, TempReading } from '../../lib/tempMonitoring';
import {
  buildReportInsertPayload,
  computeReportSummary,
  customerOptionLabel,
  defaultReportTitle,
  filterReadingsByPeriod,
  formatDateTimeLocalInput,
  getEffectiveLimits,
  parseDateTimeLocalInput,
  type TempDevice,
} from '../../lib/tempMonitoring';
import type { Customer } from '../../types';
import TempTrendChart from './TempTrendChart';

export type TempReportFormState = {
  sessionId: string;
  customerId: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  purposeNotes: string;
  notes: string;
};

type Props = {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  activeSession: TempMonitorSession | null;
  customers: Customer[];
  readings: TempReading[];
  companyId: string;
  value: TempReportFormState;
  onChange: (next: TempReportFormState) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
};

export function emptyReportForm(
  activeSession: TempMonitorSession | null,
  readings: TempReading[],
  deviceName: string,
): TempReportFormState {
  const scopedReadings = activeSession
    ? readings.filter((row) => row.session_id === activeSession.id)
    : readings;
  const start =
    activeSession?.started_at ??
    scopedReadings[0]?.recorded_at ??
    new Date(Date.now() - 24 * 3600_000).toISOString();
  const end = scopedReadings[scopedReadings.length - 1]?.recorded_at ?? new Date().toISOString();
  return {
    sessionId: activeSession?.id ?? '',
    customerId: activeSession?.customer_id ?? '',
    title: defaultReportTitle(activeSession, deviceName),
    periodStart: formatDateTimeLocalInput(start),
    periodEnd: formatDateTimeLocalInput(end),
    purposeNotes: activeSession?.notes ?? '',
    notes: '',
  };
}

export default function TempMonitorReportDialog({
  open,
  busy = false,
  error = null,
  activeSession,
  customers,
  readings,
  companyId,
  value,
  onChange,
  onClose,
  onSubmit,
}: Props) {
  const selectedSession = activeSession;

  const previewReadings = useMemo(() => {
    const start = parseDateTimeLocalInput(value.periodStart);
    const end = parseDateTimeLocalInput(value.periodEnd);
    if (!start || !end) return [];
    return filterReadingsByPeriod(readings, start, end);
  }, [readings, value.periodStart, value.periodEnd]);

  const previewLimits = useMemo(
    () => (selectedSession ? getEffectiveLimits(selectedSession) : null),
    [selectedSession],
  );

  const previewSummary = useMemo(
    () => computeReportSummary(previewReadings, previewLimits),
    [previewReadings, previewLimits],
  );

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  function setField<K extends keyof TempReportFormState>(key: K, fieldValue: TempReportFormState[K]) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="leave-draft-dialog temp-report-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="temp-report-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="temp-report-dialog-title">Tallenna raportti</h2>
        <p className="muted temp-report-dialog-lead">
          Vain tallennetut raportit jäävät muistiin. Valitse trendin aikaväli ja tarkista esikatselu ennen tallennusta.
        </p>
        <form className="form-grid" onSubmit={onSubmit}>
          <label>
            Asiakas (valinnainen)
            <select
              value={value.customerId}
              onChange={(e) => setField('customerId', e.target.value)}
            >
              <option value="">— Ei asiakasta —</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customerOptionLabel(customer, companyId)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Raportin otsikko
            <input
              value={value.title}
              onChange={(e) => setField('title', e.target.value)}
              required
            />
          </label>

          <div className="temp-settings-range-row">
            <label>
              Trendin alku
              <input
                type="datetime-local"
                value={value.periodStart}
                onChange={(e) => setField('periodStart', e.target.value)}
                required
              />
            </label>
            <label>
              Trendin loppu
              <input
                type="datetime-local"
                value={value.periodEnd}
                onChange={(e) => setField('periodEnd', e.target.value)}
                required
              />
            </label>
          </div>

          <label>
            Miksi / tarkoitus
            <textarea
              value={value.purposeNotes}
              onChange={(e) => setField('purposeNotes', e.target.value)}
              rows={2}
              placeholder="Esim. kylmäketjun varmistus, asennuksen jälkitarkistus"
            />
          </label>

          <label>
            Raportin muistiinpanot
            <textarea
              value={value.notes}
              onChange={(e) => setField('notes', e.target.value)}
              rows={2}
            />
          </label>

          <div className="temp-report-preview panel nested-panel">
            <h3>Esikatselu</h3>
            <p className="muted">
              {previewSummary.readingCount} mittausta · min {previewSummary.minTemp?.toFixed(1) ?? '—'} °C · max{' '}
              {previewSummary.maxTemp?.toFixed(1) ?? '—'} °C
            </p>
            <TempTrendChart readings={previewReadings} limits={previewLimits} height={180} />
          </div>

          {error && <p className="form-error">{error}</p>}
          <div className="leave-draft-actions">
            <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
              Peruuta
            </button>
            <button type="submit" className="btn primary" disabled={busy || previewReadings.length < 2}>
              {busy ? 'Tallennetaan…' : 'Tallenna raportti'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function resolveReportCustomer(
  customers: Customer[],
  customerId: string,
): { id: string; owner_company_id: string } | null {
  if (!customerId) return null;
  const customer = customers.find((row) => row.id === customerId);
  if (!customer) return null;
  return { id: customer.id, owner_company_id: customer.owner_company_id };
}

export function buildReportPayloadFromForm(input: {
  form: TempReportFormState;
  device: TempDevice;
  activeSession: TempMonitorSession | null;
  customers: Customer[];
  readings: TempReading[];
  companyId: string;
  userId: string;
}) {
  const periodStart = parseDateTimeLocalInput(input.form.periodStart);
  const periodEnd = parseDateTimeLocalInput(input.form.periodEnd);
  if (!periodStart || !periodEnd) {
    throw new Error('Tarkista trendin aikaväli.');
  }
  if (new Date(periodEnd).getTime() <= new Date(periodStart).getTime()) {
    throw new Error('Trendin lopun pitää olla alun jälkeen.');
  }

  const session = input.activeSession;
  const periodReadings = filterReadingsByPeriod(input.readings, periodStart, periodEnd);
  if (periodReadings.length < 2) {
    throw new Error('Valitulla aikavälillä pitää olla vähintään kaksi mittausta.');
  }

  const limits = session ? getEffectiveLimits(session) : null;
  const summary = computeReportSummary(periodReadings, limits);
  const customer = resolveReportCustomer(input.customers, input.form.customerId);

  return buildReportInsertPayload({
    device: input.device,
    session,
    customer,
    companyId: input.companyId,
    userId: input.userId,
    title: input.form.title,
    periodStart,
    periodEnd,
    purposeNotes: input.form.purposeNotes,
    notes: input.form.notes,
    summary,
  });
}
