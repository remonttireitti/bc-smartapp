export type CustomModuleFieldType = 'text' | 'textarea' | 'select' | 'checkbox';

export type CustomModuleFieldBase = {
  id: string;
  label: string;
  helpText?: string;
  required?: boolean;
};

export type CustomModuleTextField = CustomModuleFieldBase & {
  type: 'text' | 'textarea';
};

export type CustomModuleSelectField = CustomModuleFieldBase & {
  type: 'select';
  options: string[];
};

export type CustomModuleCheckboxField = CustomModuleFieldBase & {
  type: 'checkbox';
};

export type CustomModuleField =
  | CustomModuleTextField
  | CustomModuleSelectField
  | CustomModuleCheckboxField;

export type CustomReportModule = {
  id: string;
  title: string;
  fields: CustomModuleField[];
  values: Record<string, string | boolean>;
};

export const CUSTOM_MODULE_TAB_PREFIX = 'custom:';

export function customModuleTabId(moduleId: string): string {
  return `${CUSTOM_MODULE_TAB_PREFIX}${moduleId}`;
}

export function isCustomModuleTabId(tabId: string): boolean {
  return tabId.startsWith(CUSTOM_MODULE_TAB_PREFIX);
}

export function parseCustomModuleTabId(tabId: string): string | null {
  if (!isCustomModuleTabId(tabId)) return null;
  return tabId.slice(CUSTOM_MODULE_TAB_PREFIX.length) || null;
}

export function createCustomModuleField(type: CustomModuleFieldType): CustomModuleField {
  const id = createCustomModuleFieldId();
  if (type === 'select') {
    return { id, type, label: 'Uusi valinta', options: ['Vaihtoehto 1', 'Vaihtoehto 2'] };
  }
  if (type === 'checkbox') {
    return { id, type, label: 'Uusi valintaruutu' };
  }
  if (type === 'textarea') {
    return { id, type, label: 'Uusi tekstialue' };
  }
  return { id, type: 'text', label: 'Uusi tekstikenttä' };
}

export function createCustomModuleFieldId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createCustomModuleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `module-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyCustomModule(title = 'Oma moduuli'): CustomReportModule {
  return {
    id: createCustomModuleId(),
    title,
    fields: [],
    values: {},
  };
}

export function defaultValuesForFields(fields: CustomModuleField[]): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};
  for (const field of fields) {
    values[field.id] = field.type === 'checkbox' ? false : '';
  }
  return values;
}

export function mergeCustomModuleValues(
  fields: CustomModuleField[],
  existing: Record<string, string | boolean> | undefined,
): Record<string, string | boolean> {
  const next = defaultValuesForFields(fields);
  if (!existing) return next;
  for (const field of fields) {
    const value = existing[field.id];
    if (field.type === 'checkbox') {
      next[field.id] = value === true;
    } else if (typeof value === 'string') {
      next[field.id] = value;
    }
  }
  return next;
}

export function normalizeCustomReportModule(raw: unknown): CustomReportModule | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Partial<CustomReportModule>;
  if (!entry.id || !entry.title) return null;

  const fields = Array.isArray(entry.fields)
    ? entry.fields
        .map((field) => normalizeCustomModuleField(field))
        .filter((field): field is CustomModuleField => Boolean(field))
    : [];

  return {
    id: String(entry.id),
    title: String(entry.title).trim() || 'Oma moduuli',
    fields,
    values: mergeCustomModuleValues(fields, entry.values),
  };
}

function normalizeCustomModuleField(raw: unknown): CustomModuleField | null {
  if (!raw || typeof raw !== 'object') return null;
  const field = raw as Partial<CustomModuleField>;
  if (!field.id || !field.label || !field.type) return null;

  const base = {
    id: String(field.id),
    label: String(field.label).trim() || 'Kenttä',
    helpText: field.helpText ? String(field.helpText) : undefined,
    required: field.required === true,
  };

  if (field.type === 'checkbox') {
    return { ...base, type: 'checkbox' };
  }
  if (field.type === 'textarea') {
    return { ...base, type: 'textarea' };
  }
  if (field.type === 'select') {
    const options = Array.isArray((field as CustomModuleSelectField).options)
      ? (field as CustomModuleSelectField).options.map((opt) => String(opt).trim()).filter(Boolean)
      : [];
    return { ...base, type: 'select', options: options.length > 0 ? options : ['—'] };
  }
  if (field.type === 'text') {
    return { ...base, type: 'text' };
  }
  return null;
}

export function normalizeCustomReportModules(raw: unknown): CustomReportModule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => normalizeCustomReportModule(entry))
    .filter((entry): entry is CustomReportModule => Boolean(entry));
}

export function customModuleFieldTypeLabel(type: CustomModuleFieldType): string {
  switch (type) {
    case 'text':
      return 'Tekstikenttä';
    case 'textarea':
      return 'Tekstialue';
    case 'select':
      return 'Alasvalikko';
    case 'checkbox':
      return 'Valintaruutu';
    default:
      return type;
  }
}
