export type QuickSearchHit = {
  entity_type: string;
  entity_id: string;
  title: string;
  subtitle: string | null;
  parent_id?: string | null;
};

const ENTITY_LABELS: Record<string, string> = {
  customer: 'Asiakas',
  equipment: 'Laite',
  work_report: 'Työraportti',
  maintenance_report: 'Huoltoraportti',
  quote_request: 'Tarjouspyyntö',
};

export function quickSearchEntityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

export function quickSearchHitPath(hit: QuickSearchHit): string | null {
  switch (hit.entity_type) {
    case 'customer':
      return `/asiakkaat/${hit.entity_id}`;
    case 'equipment':
      return hit.parent_id ? `/asiakkaat/${hit.parent_id}` : null;
    case 'work_report':
      return `/tyoraportit/${hit.entity_id}`;
    case 'maintenance_report':
      return `/huoltoraportit/${hit.entity_id}`;
    case 'quote_request':
      return `/tarjouspyynnot/${hit.entity_id}`;
    default:
      return null;
  }
}
