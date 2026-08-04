import { escapeHtmlPrint } from '../printDocumentShell';
import type { CustomModuleField, CustomReportModule } from './customModuleTypes';

function renderCustomFieldHtml(field: CustomModuleField, value: string | boolean | undefined): string {
  const label = escapeHtmlPrint(field.label);
  if (field.type === 'checkbox') {
    const checked = value === true;
    return `<p>${checked ? '☑' : '☐'} ${label}</p>`;
  }
  const display = typeof value === 'string' && value.trim() ? escapeHtmlPrint(value) : '—';
  if (field.type === 'textarea') {
    return `<p><strong>${label}:</strong><br>${display.replace(/\n/g, '<br>')}</p>`;
  }
  return `<p><strong>${label}:</strong> ${display}</p>`;
}

export function renderCustomModulesPrintHtml(modules: CustomReportModule[] | undefined): string {
  if (!modules?.length) return '';
  return modules
    .map((module) => {
      const fields = module.fields
        .map((field) => renderCustomFieldHtml(field, module.values[field.id]))
        .join('');
      if (!fields) return '';
      return `<section class="print-section"><h3>${escapeHtmlPrint(module.title)}</h3>${fields}</section>`;
    })
    .join('');
}
