export type InstallationPlanSection = {
  id: string;
  title: string;
  body: string;
};

export type InstallationPlanData = {
  propertyName: string;
  units: string;
  installationType: string;
  descriptionIntro: string;
  sections: InstallationPlanSection[];
  attachmentsNote: string;
  closingText: string;
  contactInfo: string;
  notes: string;
};

export type InstallationPlanStatus = 'draft' | 'sent';

export type InstallationPlanRow = {
  id: string;
  title: string;
  status: InstallationPlanStatus;
  data: InstallationPlanData | Record<string, unknown>;
  updated_at: string;
  created_at: string;
  customer_id: string | null;
  equipment_id: string | null;
  owner_company_id: string;
  branding_company_id: string;
  created_by_company_id: string;
  partnership_id: string | null;
  subscriber_id: string | null;
  subscriber_portal_visibility: string;
  customers?: { name: string; address?: string | null; city?: string | null } | null;
  equipment?: { name: string; tag?: string | null } | null;
  owner_company?: { name: string } | null;
  branding_company?: { name: string } | null;
  created_by_company?: { name: string } | null;
};

export type InstallationPlanAttachment = {
  id: string;
  installation_plan_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  created_at: string;
};
