import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { useCompanyHuoltoSettings } from '../../hooks/useCompanyHuoltoSettings';
import { useProfile } from '../../hooks/useProfile';
import {
  createWorkReportFromHuolto,
  huoltoPriceDefaults,
  huoltoTransferTotal,
  parseEuroInput,
  type HuoltoTransferReport,
} from '../../lib/huoltoWorkReportTransfer';
import { formatEuro } from '../../lib/workReportBilling';
import { supabase } from '../../lib/supabase';

type Props = {
  session: Session;
  report: HuoltoTransferReport | null;
  typeKey: string;
  typeLabel: string;
  customerName: string;
  deviceLabel?: string;
  logDate: string;
  done: boolean;
  linkedWorkReportId?: string | null;
  disabled?: boolean;
  /** Tallentaa raportin ennen siirtoa; false = keskeytä. */
  beforeTransfer?: () => Promise<boolean>;
  onLinked: (workReportId: string) => void | Promise<void>;
};

function numText(n: number): string {
  return n > 0 ? String(n).replace('.', ',') : '';
}

/** "Siirrä työraporttiin": hinnaston perushinta urakkana + valinnaiset lisätunnit. */
export default function HuoltoWorkReportTransfer({
  session,
  report,
  typeKey,
  typeLabel,
  customerName,
  deviceLabel,
  logDate,
  done,
  linkedWorkReportId,
  disabled,
  beforeTransfer,
  onLinked,
}: Props) {
  const { profile } = useProfile(session);
  const { settings } = useCompanyHuoltoSettings(profile?.company_id, session);
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState('');
  const [hours, setHours] = useState('');
  const [hourly, setHourly] = useState('');
  const [date, setDate] = useState(logDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (linkedWorkReportId) {
    return (
      <Link to={`/tyoraportit/${linkedWorkReportId}`} className="btn btn-secondary">
        Avaa työraportti
      </Link>
    );
  }

  function openDialog() {
    const d = huoltoPriceDefaults(settings, typeKey);
    setPrice(numText(d.price));
    setHourly(numText(d.hourly));
    setHours('');
    setDate(logDate);
    setError(null);
    setOpen(true);
  }

  const priceN = parseEuroInput(price);
  const hoursN = parseEuroInput(hours);
  const hourlyN = parseEuroInput(hourly);
  const total = huoltoTransferTotal({ price: priceN, hours: hoursN, hourlyRate: hourlyN });

  async function submit() {
    if (!profile?.company_id) return;
    setBusy(true);
    setError(null);
    try {
      if (beforeTransfer && !(await beforeTransfer())) {
        setBusy(false);
        return;
      }
      if (!report) throw new Error('Tallenna raportti ensin.');
      if (!report.customer_id) throw new Error('Valitse asiakas ennen siirtoa.');
      const id = await createWorkReportFromHuolto(supabase, {
        report,
        customerName,
        typeLabel,
        deviceLabel,
        price: priceN,
        hours: hoursN,
        hourlyRate: hourlyN,
        logDate: date,
        done,
        sessionUserId: session.user.id,
        creatorCompanyId: profile.company_id,
      });
      await onLinked(id);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Siirto epäonnistui.');
    }
    setBusy(false);
  }

  return (
    <>
      <button type="button" className="btn btn-secondary" disabled={disabled || busy} onClick={openDialog}>
        Siirrä työraporttiin
      </button>
      {open ? (
        <div className="leave-draft-overlay" role="presentation" onClick={busy ? undefined : () => setOpen(false)}>
          <div className="leave-draft-dialog panel huolto-transfer-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Siirrä työraporttiin</h2>
            <p className="muted">{typeLabel}</p>
            <div className="form-grid huolto-transfer-grid">
              <label>
                Perushinta € (alv 0 %)
                <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
              </label>
              <label>
                Lisätunnit h
                <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
              </label>
              <label>
                Tuntihinta €/h (alv 0 %)
                <input inputMode="decimal" value={hourly} onChange={(e) => setHourly(e.target.value)} disabled={!(hoursN > 0)} />
              </label>
              <label>
                Päivä
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            </div>
            <p>
              Yhteensä <strong>{formatEuro(total)}</strong> (alv 0 %)
              {hoursN > 0 && !(hourlyN > 0) ? ` + ${String(hoursN).replace('.', ',')} h asiakkaan tuntihinnalla` : ''}
            </p>
            {error ? <p className="error">{error}</p> : null}
            <div className="leave-draft-actions">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setOpen(false)}>
                Peruuta
              </button>
              <button type="button" className="btn btn-primary" disabled={busy || !(priceN > 0 || hoursN > 0) || !date} onClick={() => void submit()}>
                {busy ? 'Luodaan…' : 'Luo työraportti'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
