import DailyLogTileSection from './DailyLogTileSection';
import { DAILY_LOG_SECTION_COLORS } from '../lib/dailyLogSectionHelpers';
import {
  dailyLogQuoteExtrasSubtitle,
  type DailyLogExtraBillingFormFields,
} from '../lib/dailyLogCustomerExtraBilling';
import { formatEuro } from '../lib/workReportBilling';

type Props = {
  form: DailyLogExtraBillingFormFields;
  setForm: (next: DailyLogExtraBillingFormFields) => void;
  defaultHourlyRate?: number | null;
  enabled?: boolean;
  blockedReason?: 'no_quote' | 'mode_off' | null;
};

export default function DailyLogCustomerExtraBillingFields({
  form,
  setForm,
  defaultHourlyRate = null,
  enabled = true,
  blockedReason = null,
}: Props) {
  function patch(fields: Partial<DailyLogExtraBillingFormFields>) {
    setForm({ ...form, ...fields });
  }

  const subtitle = !enabled
    ? blockedReason === 'no_quote'
      ? 'Linkitä tarjous työraportille'
      : 'Ota käyttöön tarjouspaneelista'
    : dailyLogQuoteExtrasSubtitle(form);

  return (
    <DailyLogTileSection
      sectionKey="quote-extras"
      title="Lisä työt ja kulut"
      subtitle={subtitle}
      color={DAILY_LOG_SECTION_COLORS.quoteExtras}
      incomplete={false}
      wide
    >
      {!enabled ? (
        <p className="muted" style={{ marginTop: 0 }}>
          {blockedReason === 'no_quote' ? (
            <>
              Avaa työraportin <strong>Tarjous ja kate</strong> -osio, valitse tarjous ja tallenna.
              Sen jälkeen voit kirjata lisätyöt ja -kulut tähän.
            </>
          ) : (
            <>
              Avaa työraportin <strong>Tarjous ja kate</strong> -osio, valitse{' '}
              <strong>Lisää lisätyöt ja -kulut tarjouksen päälle</strong> ja tallenna tarjous.
            </>
          )}
        </p>
      ) : (
        <>
        <p className="muted" style={{ marginTop: 0 }}>
          Kirjaa tähän tarjouksen päälle laskutettavat lisätyöt. Nämä eivät ole sama asia kuin yllä
          olevat kalenteritunnit.
        </p>
      <div className="line-form-grid">
        <label>
          Lisätyö tunnit
          <input
            type="number"
            step="0.25"
            min="0"
            value={form.extra_hours}
            onChange={(e) => patch({ extra_hours: e.target.value })}
            placeholder="0"
          />
        </label>
        <label>
          Tunnin hinta (€)
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.extra_hourly_rate}
            onChange={(e) => patch({ extra_hourly_rate: e.target.value })}
            placeholder={
              defaultHourlyRate != null && defaultHourlyRate > 0
                ? `oletus ${formatEuro(defaultHourlyRate)}`
                : 'oletus asiakashinnoista'
            }
          />
        </label>
        <label className="span-2">
          Selitys
          <textarea
            rows={3}
            value={form.extra_description}
            onChange={(e) => patch({ extra_description: e.target.value })}
            placeholder="Esim. väliaikainen syöttö asennettu lisätyönä"
          />
        </label>
      </div>
      <h4 className="billing-breakdown-heading" style={{ marginTop: '0.75rem' }}>
        Lisänä laskutettava tarvike / kulu
      </h4>
      <div className="line-form-grid">
        <label className="span-2">
          Kuvaus
          <input
            type="text"
            value={form.extra_expense_description}
            onChange={(e) => patch({ extra_expense_description: e.target.value })}
            placeholder="Esim. Onninen-lasku"
          />
        </label>
        <label>
          Määrä
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.extra_expense_qty}
            onChange={(e) => patch({ extra_expense_qty: e.target.value })}
          />
        </label>
        <label>
          Hankintahinta (€ / kpl)
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.extra_expense_purchase_price}
            onChange={(e) => patch({ extra_expense_purchase_price: e.target.value })}
            placeholder="0"
          />
        </label>
        <label>
          Asiakashinta (€ / kpl)
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.extra_expense_customer_price}
            onChange={(e) => patch({ extra_expense_customer_price: e.target.value })}
            placeholder="0"
          />
        </label>
      </div>
        </>
      )}
    </DailyLogTileSection>
  );
}
