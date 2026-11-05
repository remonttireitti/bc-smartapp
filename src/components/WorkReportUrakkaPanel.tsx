import { useState } from 'react';
import CheckToggle from './CheckToggle';
import {
  DEFAULT_PARTNER_URAKKA_PERCENT,
  computePartnerBillFromCustomerPrice,
  parsePartnerPercent,
  type UrakkaReportMode,
  type UrakkaReportPriceInput,
  type UrakkaReportSummary,
} from '../lib/workReportUrakkaReport';

function eur(amount: number) {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

function numText(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value > 0 ? String(value) : '';
}

/** Koko työraportin urakkahinta: kumppanihinta suoraan tai asiakashinnasta %-osuutena. */
export default function WorkReportUrakkaPanel({
  summary,
  showCustomerPrice,
  busy,
  warrantyOn,
  showWarranty,
  onSave,
  onToggleUrakka,
  onToggleWarranty,
}: {
  summary: UrakkaReportSummary;
  /** Takuu koko raportille. */
  warrantyOn: boolean;
  showWarranty: boolean;
  onToggleUrakka: (on: boolean) => void;
  onToggleWarranty: (on: boolean) => void;
  /** Oma raportti: asiakashinta näytetään myös suoraan syötettäessä. */
  showCustomerPrice: boolean;
  busy: boolean;
  onSave: (input: UrakkaReportPriceInput) => void;
}) {
  const [mode, setMode] = useState<UrakkaReportMode>(summary.mode);
  const [customer, setCustomer] = useState(numText(summary.customerTotal));
  const [percent, setPercent] = useState(String(summary.partnerPercent || DEFAULT_PARTNER_URAKKA_PERCENT));
  const [partner, setPartner] = useState(numText(summary.partnerTotal));

  const customerNum = Number(customer.replace(',', '.'));
  const pct = parsePartnerPercent(percent);
  const calc =
    mode === 'from_customer' && customerNum > 0 ? computePartnerBillFromCustomerPrice(customerNum, pct) : null;

  return (
    <div className="urakka-report-form">
      <label className="compact-option urakka-report-toggle">
        <CheckToggle
          checked={summary.hasUrakka}
          disabled={busy}
          aria-label="Urakka"
          onChange={(e) => onToggleUrakka(e.target.checked)}
        />
        <span>Urakka</span>
      </label>
      {summary.hasUrakka ? (
    <form
      className="urakka-report-form urakka-report-price"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ mode, customer, partnerPercent: percent, partner });
      }}
    >
      <label className="compact-option urakka-report-toggle">
        <CheckToggle
          checked={mode === 'from_customer'}
          aria-label="Laske asiakashinnasta"
          onChange={(e) => setMode(e.target.checked ? 'from_customer' : 'direct')}
        />
        <span>Laske asiakashinnasta</span>
      </label>

      {mode === 'from_customer' ? (
        <>
          <label className="urakka-report-field">
            <span>Asiakkaalle annettu hinta (€, alv 0 %)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Esim. 5000"
            />
          </label>
          <label className="urakka-report-field">
            <span>Kumppanilta laskutetaan (%)</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              max="100"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </label>
          <dl className="urakka-report-result">
            <div>
              <dt>Kumppanille laskutettava</dt>
              <dd data-testid="urakka-partner-bill">{eur(calc?.partnerBill ?? 0)}</dd>
            </div>
            <div>
              <dt>Jää kumppanille ({Math.round((100 - pct) * 100) / 100} %)</dt>
              <dd data-testid="urakka-partner-keeps">{eur(calc?.partnerKeeps ?? 0)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <>
          <label className="urakka-report-field">
            <span>Urakkahinta kumppanille (€, alv 0 %)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={partner}
              onChange={(e) => setPartner(e.target.value)}
              placeholder="0 = ei laskuteta"
            />
          </label>
          {showCustomerPrice ? (
            <label className="urakka-report-field">
              <span>Asiakkaan urakkahinta (€, alv 0 %)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Tyhjä = sama kuin kumppanihinta"
              />
            </label>
          ) : null}
        </>
      )}

      <div className="form-actions urakka-report-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Tallennetaan…' : 'Tallenna'}
        </button>
      </div>
    </form>
      ) : null}
      {showWarranty ? (
        <label className="compact-option urakka-report-toggle">
          <CheckToggle
            checked={warrantyOn}
            disabled={busy}
            aria-label="Takuu"
            onChange={(e) => onToggleWarranty(e.target.checked)}
          />
          <span>Takuu</span>
        </label>
      ) : null}
    </div>
  );
}
