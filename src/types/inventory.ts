export type RefrigerantSource = 'warehouse' | 'partner_warehouse' | 'supplier';

export type RefrigerantSupplierPaidBy = 'own' | 'partner';

export type RefrigerantCylinderOwnership = 'owned' | 'rental';

export type RefrigerantStockSource = 'purchase' | 'customer_retrieved';

export type RefrigerantMovementType =
  | 'purchase'
  | 'customer_retrieve'
  | 'work_use'
  | 'adjustment'
  | 'recycle'
  | 'return_rental';

export type RefrigerantCylinder = {
  id: string;
  company_id: string;
  serial_number: string;
  refrigerant_type: string;
  purchased_kg: number;
  remaining_kg: number;
  owner_user_id: string | null;
  ownership_type: RefrigerantCylinderOwnership;
  stock_source: RefrigerantStockSource;
  customer_id: string | null;
  location: string | null;
  status: string;
  purchase_date: string | null;
  returned_at: string | null;
  notes: string | null;
  image_path: string | null;
  created_at: string;
  updated_at: string;
  company_name?: string | null;
  owner_user?: { display_name: string | null; email: string | null } | null;
  customer?: { name: string | null } | null;
};

export type RefrigerantCylinderMovement = {
  id: string;
  company_id: string;
  cylinder_id: string | null;
  movement_type: RefrigerantMovementType;
  qty_kg: number;
  refrigerant_type: string;
  serial_number: string | null;
  customer_id: string | null;
  location: string | null;
  ownership_type: string | null;
  work_report_id: string | null;
  notes: string | null;
  created_at: string;
  customer?: { name: string | null } | null;
};

export const REFRIGERANT_CYLINDER_OWNERSHIP_LABELS: Record<RefrigerantCylinderOwnership, string> = {
  owned: 'Omistus',
  rental: 'Vuokra',
};

export const REFRIGERANT_CYLINDER_STATUS_LABELS: Record<string, string> = {
  in_stock: 'Varastossa',
  empty: 'Tyhjä (varastossa)',
  returned: 'Palautettu',
  recycled: 'Kierrätykseen toimitettu',
  retired: 'Poistettu',
};

export const REFRIGERANT_STOCK_SOURCE_LABELS: Record<RefrigerantStockSource, string> = {
  purchase: 'Ostettu',
  customer_retrieved: 'Asiakkaalta talteen',
};

export const REFRIGERANT_MOVEMENT_TYPE_LABELS: Record<RefrigerantMovementType, string> = {
  purchase: 'Osto / varastoon',
  customer_retrieve: 'Asiakkaalta talteen',
  work_use: 'Käyttö työkohteella',
  adjustment: 'Saldon muutos',
  recycle: 'Kierrätykseen toimitettu',
  return_rental: 'Vuokrapullo palautettu',
};

export type WorkReportRefrigerantLine = {
  id: string;
  daily_log_id: string;
  work_report_id: string;
  source: RefrigerantSource;
  cylinder_id: string | null;
  warehouse_company_id: string | null;
  owner_user_id: string | null;
  supplier_name: string | null;
  supplier_paid_by: RefrigerantSupplierPaidBy | null;
  unit_price: number;
  customer_unit_price: number | null;
  bill_to_customer: boolean;
  refrigerant_type: string;
  qty_kg: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  cylinder?: Pick<RefrigerantCylinder, 'serial_number' | 'refrigerant_type'> | null;
  warehouse_company?: { name: string | null } | null;
  owner_user?: { display_name: string | null } | null;
};

export type InventoryItem = {
  id: string;
  company_id: string;
  sku: string | null;
  name: string;
  unit: string;
  qty_on_hand: number;
  min_qty: number;
  location: string | null;
  item_type: string;
  image_path: string | null;
  created_at: string;
  updated_at: string;
};

export type Tool = {
  id: string;
  company_id: string;
  tag_id: string | null;
  name: string;
  category: string | null;
  status: string;
  assigned_user_id: string | null;
  last_service_at: string | null;
  created_at: string;
  updated_at: string;
  assigned_user?: { display_name: string | null; email: string | null } | null;
};

export type ToolLoan = {
  id: string;
  tool_id: string;
  user_id: string;
  work_report_id: string | null;
  loaned_at: string;
  returned_at: string | null;
  user?: { display_name: string | null; email: string | null } | null;
  tool?: Pick<Tool, 'name' | 'tag_id'> | null;
};

export const REFRIGERANT_PARTNER_BILLING_REMINDER =
  'Kumppani laskuttaa asiakkaalta. Raportin laatija ei laskuta kumppanilta.';

export const REFRIGERANT_SUPPLIER_PARTNER_REMINDER =
  'Kylmäaine hankittu kumppanin piikkiin. Kumppani laskuttaa asiakkaalta. Raportin laatija ei laskuta kumppanilta.';

export const REFRIGERANT_SOURCE_LABELS: Record<RefrigerantSource, string> = {
  warehouse: 'Omasta varastosta',
  partner_warehouse: 'Kumppanin varastosta',
  supplier: 'Tukkurilta',
};

export const TOOL_STATUS_LABELS: Record<string, string> = {
  available: 'Vapaa',
  loaned: 'Lainassa',
  service: 'Huollossa',
  retired: 'Poistettu',
};
