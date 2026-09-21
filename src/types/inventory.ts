export type RefrigerantSource = 'warehouse' | 'partner_warehouse' | 'supplier';

export type RefrigerantSupplierPaidBy = 'own' | 'partner';

export type RefrigerantCylinderOwnership = 'owned' | 'rental';

export type RefrigerantRentalSupplier =
  | 'darment'
  | 'combi_cool'
  | 'ecoscandic'
  | 'onninen'
  | 'refair';

export const REFRIGERANT_RENTAL_SUPPLIER_LABELS: Record<RefrigerantRentalSupplier, string> = {
  darment: 'Darment',
  combi_cool: 'Combi Cool',
  ecoscandic: 'Ecoscandic',
  onninen: 'Onninen',
  refair: 'Refair',
};

export const REFRIGERANT_RENTAL_SUPPLIER_ORDER: RefrigerantRentalSupplier[] = [
  'darment',
  'combi_cool',
  'ecoscandic',
  'onninen',
  'refair',
];

export type RefrigerantStockSource = 'purchase' | 'customer_retrieved';

export type BottleSize = 'small' | 'medium' | 'large';

export type RefrigerantCylinderDisposition = 'partial_in_stock' | 'empty_in_stock' | 'return_to_supplier';

export type RefrigerantMovementType =
  | 'purchase'
  | 'customer_retrieve'
  | 'work_use'
  | 'adjustment'
  | 'recycle'
  | 'return_rental'
  | 'dispose';

export const BOTTLE_SIZE_LABELS: Record<BottleSize, string> = {
  small: 'Pieni',
  medium: 'Keskikokoinen',
  large: 'Iso',
};

export const REFRIGERANT_CYLINDER_DISPOSITION_LABELS: Record<RefrigerantCylinderDisposition, string> = {
  partial_in_stock: 'Jää pulloon varastoon',
  empty_in_stock: 'Pullo tyhjenee varastoon',
  return_to_supplier: 'Pullo palautetaan tukkurille',
};

export type RefrigerantCylinder = {
  id: string;
  company_id: string;
  serial_number: string | null;
  bottle_size: BottleSize;
  non_recyclable: boolean;
  /** Nykyinen aine; tyhjällä pullolla null tai tyhjä */
  refrigerant_type: string | null;
  /** Enimmäistäyttö (synkassa capacity_kg) */
  purchased_kg: number;
  remaining_kg: number;
  /** Pulmon nimellistilavuus kg */
  capacity_kg: number;
  owner_user_id: string | null;
  ownership_type: RefrigerantCylinderOwnership;
  rental_supplier: RefrigerantRentalSupplier | null;
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
  dispose: 'Poistettu varastosta',
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
  warehouse_cost_deducted?: boolean;
  refrigerant_type: string;
  qty_kg: number;
  notes: string | null;
  cylinder_disposition: RefrigerantCylinderDisposition | null;
  created_by: string | null;
  created_at: string;
  cylinder?: Pick<RefrigerantCylinder, 'serial_number' | 'refrigerant_type' | 'bottle_size' | 'notes'> | null;
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

export type ToolImage = {
  id: string;
  company_id: string;
  tool_id: string;
  image_path: string;
  sort_order: number;
  created_at: string;
};

export type Tool = {
  id: string;
  company_id: string;
  tag_id: string | null;
  serial_number: string | null;
  name: string;
  category: string | null;
  status: string;
  assigned_user_id: string | null;
  last_service_at: string | null;
  purchased_at: string | null;
  purchased_from: string | null;
  purchase_price_eur: number | null;
  is_loanable: boolean;
  rate_day_eur: number | null;
  rate_weekend_eur: number | null;
  rate_week_eur: number | null;
  rate_month_eur: number | null;
  created_at: string;
  updated_at: string;
  assigned_user?: { display_name: string | null; email: string | null } | null;
  images?: ToolImage[];
};

export type ToolLoan = {
  id: string;
  tool_id: string;
  user_id: string;
  work_report_id: string | null;
  loaned_at: string;
  returned_at: string | null;
  expected_return_at: string | null;
  notes: string | null;
  /** Omistajan sulku — ei aito lainaus. */
  is_blockout?: boolean;
  user?: { display_name: string | null; email: string | null } | null;
  tool?: Pick<Tool, 'name' | 'tag_id' | 'serial_number'> | null;
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

export type ToolBookingStatus = 'pending' | 'confirmed' | 'cancelled';

export type ToolBookingDeliveryMode = 'none' | 'delivery' | 'pickup' | 'both';

export type ToolBooking = {
  id: string;
  company_id: string;
  tool_id: string;
  status: ToolBookingStatus;
  starts_at: string;
  ends_at: string;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  delivery_mode: ToolBookingDeliveryMode;
  delivery_distance_km: number | null;
  delivery_fee_eur: number | null;
  delivery_address: string | null;
  notes: string | null;
  confirmed_loan_id: string | null;
  created_at: string;
  updated_at: string;
  tool?: Pick<Tool, 'name' | 'tag_id' | 'serial_number'> | null;
};

export type CompanyToolsDeliverySettings = {
  tools_booking_token: string | null;
  tools_booking_enabled: boolean;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  delivery_min_fee_eur: number | null;
  delivery_distance_limit_km: number | null;
  delivery_per_km_eur: number | null;
};

export type ToolBookingPublicTool = {
  id: string;
  name: string;
  category: string | null;
  status: string;
  rate_day_eur: number | null;
  rate_weekend_eur: number | null;
  rate_week_eur: number | null;
  rate_month_eur: number | null;
  image_path: string | null;
};

export type ToolBookingBusyRange = {
  tool_id: string;
  starts_at: string;
  ends_at: string | null;
  source: 'loan' | 'blockout' | 'booking' | string;
  status: string;
};

export type ToolBookingPublicBundle = {
  company: {
    id: string;
    name: string;
    delivery_enabled: boolean;
    pickup_enabled: boolean;
    delivery_min_fee_eur: number | null;
    delivery_distance_limit_km: number | null;
    delivery_per_km_eur: number | null;
  };
  tools: ToolBookingPublicTool[];
  busy: ToolBookingBusyRange[];
};

export const TOOL_BOOKING_STATUS_LABELS: Record<ToolBookingStatus, string> = {
  pending: 'Jonossa',
  confirmed: 'Vahvistettu',
  cancelled: 'Peruttu',
};

/** FI labels for delivery_mode: none=self both; pickup=self out + company return; delivery=company out + self return; both=company both. */
export const TOOL_BOOKING_DELIVERY_LABELS: Record<ToolBookingDeliveryMode, string> = {
  none: 'Haen ja palautan itse',
  pickup: 'Haen työkalu(t) itse, tilaan palautuksen',
  delivery: 'Työkalujen haku tilataan, palautan itse',
  both: 'Tilaan kuljetuksen molempiin suuntiin',
};
