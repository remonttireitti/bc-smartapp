import ToggleSwitch from './ToggleSwitch';
import {
  CUSTOMER_PRINT_QUANTITY_UNIT_OPTIONS,
  type CustomerPrintQuantitySettings,
  type CustomerPrintQuantityUnit,
} from '../lib/workReportCustomerPrintSettings';

type Props = {
  settings: CustomerPrintQuantitySettings;
  onChange: (settings: CustomerPrintQuantitySettings) => void;
  inDialog?: boolean;
};

const EXPENSE_UNIT_TYPES = [
  { key: 'km', label: 'KM-korvaus' },
  { key: 'parking', label: 'Pysäköinti' },
  { key: 'part', label: 'Varaosa' },
  { key: 'material', label: 'Tarvike' },
  { key: 'other', label: 'Muu kulu' },
] as const;

export default function WorkReportCustomerPrintSettingsPanel({ settings, onChange, inDialog = false }: Props) {
  function patch(patch: Partial<CustomerPrintQuantitySettings>) {
    onChange({ ...settings, ...patch });
  }

  function setExpenseUnit(expenseType: string, unit: CustomerPrintQuantityUnit) {
    onChange({
      ...settings,
      expenseUnits: { ...settings.expenseUnits, [expenseType]: unit },
    });
  }

  function setShowQuantities(checked: boolean) {
    onChange({
      ...settings,
      showQuantities: checked,
      showHourQuantities: checked,
      showExpenseQuantities: checked,
      showRefrigerantQuantities: checked,
      showSummaryQuantities: checked,
    });
  }

  return (
    <div className={`work-report-customer-print-settings${inDialog ? '' : ' panel-inset'}`}>
      {inDialog ? null : (
        <>
          <h3 className="work-report-customer-print-settings-title">Asiakastulosteen määrät</h3>
          <p className="muted work-report-customer-print-settings-hint">
            Valitse näytetäänkö määrät ja millä yksiköillä (h, kpl, kg, km, urakka…).
          </p>
        </>
      )}
      {inDialog ? (
        <p className="muted work-report-customer-print-settings-hint">
          Valitse näytetäänkö määrät ja millä yksiköillä (h, kpl, kg, km, urakka…).
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
              label="Tunnit päiväkirjauksessa"
              checked={settings.showHourQuantities}
              onChange={(checked) => patch({ showHourQuantities: checked })}
            />
            <ToggleSwitch
              label="Kulut ja tarvikkeet"
              checked={settings.showExpenseQuantities}
              onChange={(checked) => patch({ showExpenseQuantities: checked })}
            />
            <ToggleSwitch
              label="Kylmäaine"
              checked={settings.showRefrigerantQuantities}
              onChange={(checked) => patch({ showRefrigerantQuantities: checked })}
            />
            <ToggleSwitch
              label="Yhteenveto (tunnit yhteensä jne.)"
              checked={settings.showSummaryQuantities}
              onChange={(checked) => patch({ showSummaryQuantities: checked })}
            />
          </>
        ) : null}
      </div>
      {settings.showQuantities && settings.showExpenseQuantities ? (
        <div className="work-report-customer-print-unit-grid">
          <p className="muted">Kulujen yksiköt:</p>
          {EXPENSE_UNIT_TYPES.map((row) => (
            <label key={row.key} className="work-report-customer-print-unit-row">
              <span>{row.label}</span>
              <select
                value={settings.expenseUnits[row.key] ?? settings.defaultExpenseUnit}
                onChange={(e) => setExpenseUnit(row.key, e.target.value as CustomerPrintQuantityUnit)}
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
