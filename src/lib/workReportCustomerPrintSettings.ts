/** Asiakastulosteen määrä- ja yksikköasetukset. */
export type CustomerPrintQuantityUnit =
  | 'h'
  | 'kpl'
  | 'erä'
  | 'urakka'
  | 'kg'
  | 'l'
  | 'm'
  | 'km'
  | 'm²'
  | 'm³'
  | 'pv'
  | 'vrk';

export const CUSTOMER_PRINT_QUANTITY_UNIT_OPTIONS: Array<{
  value: CustomerPrintQuantityUnit;
  label: string;
}> = [
  { value: 'h', label: 'h (tunti)' },
  { value: 'kpl', label: 'kpl' },
  { value: 'erä', label: 'erä' },
  { value: 'urakka', label: 'urakka' },
  { value: 'kg', label: 'kg' },
  { value: 'l', label: 'l' },
  { value: 'm', label: 'm' },
  { value: 'km', label: 'km' },
  { value: 'm²', label: 'm²' },
  { value: 'm³', label: 'm³' },
  { value: 'pv', label: 'pv (päivä)' },
  { value: 'vrk', label: 'vrk' },
];

export type CustomerPrintQuantitySettings = {
  /** Näytetäänkö määrät asiakastulosteessa. */
  showQuantities: boolean;
  showHourQuantities: boolean;
  showExpenseQuantities: boolean;
  showRefrigerantQuantities: boolean;
  showSummaryQuantities: boolean;
  /** Kulutyypin oletusyksikkö (expense_type → yksikkö). */
  expenseUnits: Partial<Record<string, CustomerPrintQuantityUnit>>;
  defaultExpenseUnit: CustomerPrintQuantityUnit;
};

export const DEFAULT_CUSTOMER_PRINT_QUANTITY_SETTINGS: CustomerPrintQuantitySettings = {
  showQuantities: true,
  showHourQuantities: true,
  showExpenseQuantities: true,
  showRefrigerantQuantities: true,
  showSummaryQuantities: true,
  expenseUnits: {
    km: 'km',
    parking: 'kpl',
    part: 'kpl',
    material: 'kpl',
    other: 'kpl',
  },
  defaultExpenseUnit: 'kpl',
};

function parseBoolParam(value: string | null, fallback: boolean): boolean {
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return fallback;
}

/** Lukee asetukset URL-parametreista (?maarat=0&maarat_tunnit=1 …). */
export function parseCustomerPrintQuantitySettings(
  searchParams: URLSearchParams,
): CustomerPrintQuantitySettings {
  const defaults = DEFAULT_CUSTOMER_PRINT_QUANTITY_SETTINGS;
  const showQuantities = parseBoolParam(searchParams.get('maarat'), defaults.showQuantities);
  const showHourQuantities = parseBoolParam(
    searchParams.get('maarat_tunnit'),
    showQuantities ? defaults.showHourQuantities : false,
  );
  const showExpenseQuantities = parseBoolParam(
    searchParams.get('maarat_kulut'),
    showQuantities ? defaults.showExpenseQuantities : false,
  );
  const showRefrigerantQuantities = parseBoolParam(
    searchParams.get('maarat_kylmaaine'),
    showQuantities ? defaults.showRefrigerantQuantities : false,
  );
  const showSummaryQuantities = parseBoolParam(
    searchParams.get('maarat_yhteenveto'),
    showQuantities ? defaults.showSummaryQuantities : false,
  );

  const expenseUnits = { ...defaults.expenseUnits };
  for (const key of Object.keys(defaults.expenseUnits)) {
    const override = searchParams.get(`yksikko_${key}`);
    if (override && isCustomerPrintQuantityUnit(override)) {
      expenseUnits[key] = override;
    }
  }
  const defaultExpenseUnitRaw = searchParams.get('yksikko_oletus');
  const defaultExpenseUnit =
    defaultExpenseUnitRaw && isCustomerPrintQuantityUnit(defaultExpenseUnitRaw)
      ? defaultExpenseUnitRaw
      : defaults.defaultExpenseUnit;

  return {
    showQuantities,
    showHourQuantities,
    showExpenseQuantities,
    showRefrigerantQuantities,
    showSummaryQuantities,
    expenseUnits,
    defaultExpenseUnit,
  };
}

export function serializeCustomerPrintQuantitySettings(
  settings: CustomerPrintQuantitySettings,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('maarat', settings.showQuantities ? '1' : '0');
  if (!settings.showHourQuantities) params.set('maarat_tunnit', '0');
  if (!settings.showExpenseQuantities) params.set('maarat_kulut', '0');
  if (!settings.showRefrigerantQuantities) params.set('maarat_kylmaaine', '0');
  if (!settings.showSummaryQuantities) params.set('maarat_yhteenveto', '0');
  for (const [key, unit] of Object.entries(settings.expenseUnits)) {
    const defaultUnit = DEFAULT_CUSTOMER_PRINT_QUANTITY_SETTINGS.expenseUnits[key];
    if (unit && unit !== defaultUnit) params.set(`yksikko_${key}`, unit);
  }
  if (settings.defaultExpenseUnit !== DEFAULT_CUSTOMER_PRINT_QUANTITY_SETTINGS.defaultExpenseUnit) {
    params.set('yksikko_oletus', settings.defaultExpenseUnit);
  }
  return params;
}

export function customerPrintQuantitySettingsPath(
  reportId: string,
  settings: CustomerPrintQuantitySettings,
): string {
  const params = serializeCustomerPrintQuantitySettings(settings);
  const query = params.toString();
  return query
    ? `/tyoraportit/${reportId}/tuloste?${query}`
    : `/tyoraportit/${reportId}/tuloste`;
}

function isCustomerPrintQuantityUnit(value: string): value is CustomerPrintQuantityUnit {
  return CUSTOMER_PRINT_QUANTITY_UNIT_OPTIONS.some((option) => option.value === value);
}
