export type WorkReportCreateSection = 'basics' | 'customer' | 'task' | 'attachments';

export type WorkReportCreateVisited = Record<WorkReportCreateSection, boolean>;

export const EMPTY_WORK_REPORT_CREATE_VISITED: WorkReportCreateVisited = {
  basics: false,
  customer: false,
  task: false,
  attachments: false,
};

export function isBasicsComplete(ownerCompanyId: string) {
  return !!ownerCompanyId;
}

export function isCustomerComplete(customerId: string) {
  return !!customerId;
}

export function isTaskComplete(description: string) {
  return !!description.trim();
}

export function isReadyForScheduled(
  visited: WorkReportCreateVisited,
  data: {
    ownerCompanyId: string;
    customerId: string;
    description: string;
  },
) {
  return (
    visited.basics
    && visited.customer
    && visited.task
    && isBasicsComplete(data.ownerCompanyId)
    && isCustomerComplete(data.customerId)
    && isTaskComplete(data.description)
  );
}

export function missingScheduledRequirements(
  visited: WorkReportCreateVisited,
  data: {
    ownerCompanyId: string;
    customerId: string;
    description: string;
  },
): string[] {
  const missing: string[] = [];
  if (!visited.basics || !isBasicsComplete(data.ownerCompanyId)) {
    missing.push('Perustiedot');
  }
  if (!visited.customer || !isCustomerComplete(data.customerId)) {
    missing.push('Asiakas');
  }
  if (!visited.task || !isTaskComplete(data.description)) {
    missing.push('Tehtävä');
  }
  return missing;
}

export function basicsSubtitle(ownerCompanyName: string, visited: boolean) {
  if (!visited) return 'Avaa ja tarkista';
  return ownerCompanyName || 'Yritys valittu';
}

export function customerSubtitle(customerName: string | undefined, visited: boolean) {
  if (!visited) return 'Avaa ja valitse asiakas';
  if (!customerName) return 'Asiakas puuttuu';
  return customerName;
}

export function taskSubtitle(description: string, heading: string, visited: boolean) {
  if (!visited) return 'Avaa ja kuvaile työ';
  const text = heading.trim() || description.trim();
  if (!text) return 'Kuvaus puuttuu';
  if (text.length <= 56) return text;
  return `${text.slice(0, 55).trimEnd()}…`;
}

export function attachmentsSubtitle(count: number, visited: boolean) {
  if (!visited) return 'Avaa tarvittaessa';
  if (count === 0) return 'Ei liitteitä';
  return `${count} tiedostoa`;
}
