import ToggleSwitch from './ToggleSwitch';
import {
  CUSTOMER_PRINT_QUANTITY_UNIT_OPTIONS,
  type QuoteCustomerPrintQuantitySettings,
} from '../lib/quoteCustomerPrintSettings';
import type { QuoteMaterialRowKind } from '../lib/quoteRequest/types';
import type { CustomerPrintQuantityUnit } from '../lib/workReportCustomerPrintSettings';

type Props = {
  settings: QuoteCustomerPrintQuantitySettings;
  onChange: (settings: QuoteCustomerPrintQuantitySettings) => void;
  inDialog?: boolean;
};

const KIND_ROWS: Array<{ kind: QuoteMaterialRowKind; label: string }> = [
  { kind: 'labor', label: 'Työrivit (asennus)' },
  { kind: 'supply', label: 'Tarvikkeet' },
  { kind: 'expense', label: 'Kulut' },
  { kind: 'device', label: 'Laitteet' },
];

export default function QuoteCustomerPrintSettingsPanel({ settings, onChange, inDialog = false }: Props) {
  function patch(patch: Partial<QuoteCustomerPrintQuantitySettings>) {
    onChange({ ...settings, ...patch });
  }

  function setDefaultUnit(kind: QuoteMaterialRowKind, unit: CustomerPrintQuantityUnit) {
    onChange({
      ...settings,
      defaultUnits: { ...settings.defaultUnits, [kind]: unit },
    });
  }

  function setShowQuantities(checked: boolean) {
    onChange({
      ...settings,
      showQuantities: checked,
      showLaborQuantities: checked,
      showSupplyQuantities: checked,
      showExpenseQuantities: checked,
      showDeviceQuantities: checked,
      showWorkItemQuantities: checked,
    });
  }

  return (
    <div className={`work-report-customer-print-settings${inDialog ? '' : ' panel-inset'}`}>
      {inDialog ? null : (
        <>
          <h3 className="work-report-customer-print-settings-title">Asiakastulosteen määrät</h3>
          <p className="muted work-report-customer-print-settings-hint">
            Valitse näytetäänkö määrät ja millä yksiköillä (h, kpl, kg, erä, urakka…). Rivikohtainen yksikkö
            määritellään tarjouksen riveillä.
          </p>
        </>
      )}
      {inDialog ? (
        <p className="muted work-report-customer-print-settings-hint">
          Valitse näytetäänkö määrät ja millä yksiköillä (h, kpl, kg, erä, urakka…). Rivikohtainen yksikkö
          määritellään tarjouksen riveillä.
        </p>
      ) : null}
      <div className="toggle-grid">
        <ToggleSwitch
          label="Näytä määrät tulosteessa"
          checked={settings.showQuantities}
          onChange={setShowQuantities}
        />
        {settings.showQuantities ? (
          <>
            <ToggleSwitch
              label="Työt (työkohteet)"
              checked={settings.showWorkItemQuantities}
              onChange={(checked) => patch({ showWorkItemQuantities: checked })}
            />
            <ToggleSwitch
              label="Työrivit (asennus)"
              checked={settings.showLaborQuantities}
              onChange={(checked) => patch({ showLaborQuantities: checked })}
            />
            <ToggleSwitch
              label="Tarvikkeet"
              checked={settings.showSupplyQuantities}
              onChange={(checked) => patch({ showSupplyQuantities: checked })}
            />
            <ToggleSwitch
              label="Kulut"
              checked={settings.showExpenseQuantities}
              onChange={(checked) => patch({ showExpenseQuantities: checked })}
            />
            <ToggleSwitch
              label="Laitteet"
              checked={settings.showDeviceQuantities}
              onChange={(checked) => patch({ showDeviceQuantities: checked })}
            />
          </>
        ) : null}
      </div>
      {settings.showQuantities ? (
        <div className="work-report-customer-print-unit-grid">
          <p className="muted">Oletusyksiköt (kun rivillä ei ole omaa yksikköä):</p>
          {KIND_ROWS.map((row) => (
            <label key={row.kind} className="work-report-customer-print-unit-row">
              <span>{row.label}</span>
              <select
                value={settings.defaultUnits[row.kind] ?? (row.kind === 'labor' ? 'h' : 'kpl')}
                onChange={(e) => setDefaultUnit(row.kind, e.target.value as CustomerPrintQuantityUnit)}
              >
                {CUSTOMER_PRINT_QUANTITY_UNIT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
