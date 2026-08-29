export type WorkReportPartnerPurchaseLine = {
  id: string;
  daily_log_id: string;
  work_report_id: string;
  partner_company_id: string;
  supplier_name: string | null;
  description: string;
  qty: number;
  unit_price: number;
  partner_margin_percent: number;
  cost_deducted?: boolean;
  sort_order: number;
  created_by?: string | null;
  created_at?: string;
  partner_company?: { name: string | null } | null;
};
