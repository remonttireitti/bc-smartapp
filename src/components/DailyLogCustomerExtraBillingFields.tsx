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
  showPartnerExpenseOptions?: boolean;
};

export default function DailyLogCustomerExtraBillingFields({
  form,
  setForm,
  defaultHourlyRate = null,
  showPartnerExpenseOptions = false,
}: Props) {
  function patch(fields: Partial<DailyLogExtraBillingFormFields>) {
    setForm({ ...form, ...fields });
  }

  return (
    <DailyLogTileSection
      sectionKey="quote-extras"
      title="Lisä työt ja kulut"
      subtitle={dailyLogQuoteExtrasSubtitle(form)}
      color={DAILY_LOG_SECTION_COLORS.quoteExtras}
      incomplete={false}
      wide
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Kirjaa tarjouksen päälle laskutettavat lisätyöt ja -tarvikkeet. Täytetyt kentät sisältyvät
        automaattisesti asiakas- ja kumppanilaskuihin. Nämä eivät ole sama asia kuin kalenteritunnit.
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
          Asiakkaan tunnin hinta (€)
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
        {showPartnerExpenseOptions ? (
          <fieldset className="span-2 expense-billing-mode-fieldset">
            <legend>Kumppanien välinen laskutus (tarvike)</legend>
            <label className="compact-option">
              <input
                type="radio"
                name="extra_expense_partner_billing"
                checked={form.extra_expense_partner_billing === 'charge'}
                onChange={() => patch({ extra_expense_partner_billing: 'charge' })}
              />
              Laskutetaan kumppanilta hankintahinnalla
            </label>
            <label className="compact-option">
              <input
                type="radio"
                name="extra_expense_partner_billing"
                checked={form.extra_expense_partner_billing === 'piikki'}
                onChange={() => patch({ extra_expense_partner_billing: 'piikki' })}
              />
              Kumppanin piikki — ei välihankintalaskutusta
            </label>
          </fieldset>
        ) : null}
      </div>
      {showPartnerExpenseOptions ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          Lisätyöt laskutetaan kumppanilta kumppanin hinnaston mukaan. Asiakkaalle laskutetaan yllä
          oleva asiakashinta.
        </p>
      ) : null}
    </DailyLogTileSection>
  );
}
