export type GlobalAdminSectionId = 'companies' | 'licenses' | 'registry' | 'operations';

export const GLOBAL_ADMIN_SECTIONS: { id: GlobalAdminSectionId; label: string; description: string }[] = [
  {
    id: 'companies',
    label: 'Yritykset ja käyttäjät',
    description: 'Uudet tenantit, rivimäärät ja käyttäjäkutsut',
  },
  {
    id: 'licenses',
    label: 'Lisenssit ja moduulit',
    description: 'Kokeilu, hinnoittelu ja yrityskohtaiset oikeudet',
  },
  {
    id: 'registry',
    label: 'Rekisterikorjaukset',
    description: 'Omistajuus, duplikaatit ja massamuokkaus',
  },
  {
    id: 'operations',
    label: 'Loki ja varmuuskopiot',
    description: 'Käyttäjätoiminta, päivittäiset ja viikoittaiset vedokset, lataus ja palautus',
  },
];

export type EntityType = 'work_reports' | 'maintenance_reports' | 'customers' | 'quote_requests';

export const ENTITY_LABELS: Record<EntityType, string> = {
  work_reports: 'Työraportit',
  maintenance_reports: 'Huoltoraportit',
  customers: 'Asiakkaat',
  quote_requests: 'Tarjouspyynnöt',
};

export const ENTITY_SELECT: Record<EntityType, string> = {
  work_reports: 'id, title, customers(name)',
  maintenance_reports: 'id, title, customers(name), equipment(name, tag)',
  customers: 'id, name',
  quote_requests: 'id, title, customers(name)',
};

export const DETAIL_HEADERS: Record<EntityType, string | null> = {
  work_reports: 'Tehtävä',
  maintenance_reports: 'Laite',
  customers: null,
  quote_requests: 'Otsikko',
};

export type EntityPreviewRow = {
  id: string;
  customerLabel: string;
  detailLabel: string;
};

export type DuplicateCustomerRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  created_at: string;
  equipmentCount: number;
  workReportCount: number;
  maintenanceReportCount: number;
};

export type DuplicateCustomerGroup = {
  key: string;
  normalizedName: string;
  ownerCompanyId: string;
  ownerCompanyName: string;
  customers: DuplicateCustomerRow[];
};
