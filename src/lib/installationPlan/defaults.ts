import { defaultInstallationPlanData, INSTALLATION_PLAN_DOCUMENT_TITLE } from './defaultTemplate';
import type { InstallationPlanData, InstallationPlanSection } from './types';

export const INSTALLATION_PLAN_STATUS_LABELS = {
  draft: 'Luonnos',
  sent: 'Valmis',
} as const;

function parseSection(raw: unknown): InstallationPlanSection | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const body = typeof record.body === 'string' ? record.body : '';
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : crypto.randomUUID();
  if (!title) return null;
  return { id, title, body };
}

export function createEmptyInstallationPlanData(): InstallationPlanData {
  const defaults = defaultInstallationPlanData();
  return {
    propertyName: '',
    units: '',
    installationType: '',
    descriptionIntro: defaults.descriptionIntro,
    sections: defaults.sections.map((section) => ({ ...section, id: crypto.randomUUID() })),
    attachmentsNote: defaults.attachmentsNote,
    closingText: defaults.closingText,
    contactInfo: defaults.contactInfo,
    notes: '',
  };
}

export function normalizeInstallationPlanData(raw: unknown): InstallationPlanData {
  const empty = createEmptyInstallationPlanData();
  if (!raw || typeof raw !== 'object') return empty;
  const record = raw as Record<string, unknown>;
  const sections = Array.isArray(record.sections)
    ? record.sections.map(parseSection).filter((section): section is InstallationPlanSection => section != null)
    : empty.sections;

  return {
    propertyName: typeof record.propertyName === 'string' ? record.propertyName : '',
    units: typeof record.units === 'string' ? record.units : '',
    installationType: typeof record.installationType === 'string' ? record.installationType : '',
    descriptionIntro:
      typeof record.descriptionIntro === 'string' ? record.descriptionIntro : empty.descriptionIntro,
    sections: sections.length > 0 ? sections : empty.sections,
    attachmentsNote: typeof record.attachmentsNote === 'string' ? record.attachmentsNote : empty.attachmentsNote,
    closingText: typeof record.closingText === 'string' ? record.closingText : empty.closingText,
    contactInfo: typeof record.contactInfo === 'string' ? record.contactInfo : '',
    notes: typeof record.notes === 'string' ? record.notes : '',
  };
}

export function prepareInstallationPlanDataForSave(data: InstallationPlanData): InstallationPlanData {
  return normalizeInstallationPlanData({
    ...data,
    sections: data.sections.map((section) => ({
      id: section.id || crypto.randomUUID(),
      title: section.title.trim(),
      body: section.body,
    })),
  });
}

export function resolveInstallationPlanDisplayTitle(
  data: InstallationPlanData,
  customerName?: string | null,
): string {
  const property = data.propertyName.trim();
  if (property) return `${INSTALLATION_PLAN_DOCUMENT_TITLE} — ${property}`;
  if (customerName?.trim()) return `${INSTALLATION_PLAN_DOCUMENT_TITLE} — ${customerName.trim()}`;
  return INSTALLATION_PLAN_DOCUMENT_TITLE;
}

export function installationPlanStoredTitle(
  data: InstallationPlanData,
  customerName?: string | null,
): string {
  return resolveInstallationPlanDisplayTitle(data, customerName);
}

export function resetInstallationPlanTemplate(data: InstallationPlanData): InstallationPlanData {
  const defaults = defaultInstallationPlanData();
  return normalizeInstallationPlanData({
    ...data,
    descriptionIntro: defaults.descriptionIntro,
    sections: defaults.sections.map((section) => ({ ...section, id: crypto.randomUUID() })),
    attachmentsNote: defaults.attachmentsNote,
    closingText: defaults.closingText,
  });
}

export function createInstallationPlanSection(title = ''): InstallationPlanSection {
  return {
    id: crypto.randomUUID(),
    title,
    body: '',
  };
}
