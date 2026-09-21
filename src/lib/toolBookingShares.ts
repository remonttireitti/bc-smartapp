import { supabase } from './supabase';
import type {
  ToolBooking,
  ToolBookingPublicBundle,
  CompanyToolsDeliverySettings,
  ToolBookingDeliveryMode,
} from '../types/inventory';

export function toolsBookingPath(token: string): string {
  return `/tyokalut/varaus/${token}`;
}

export function toolsBookingUrl(token: string): string {
  if (typeof window === 'undefined') return toolsBookingPath(token);
  return `${window.location.origin}${toolsBookingPath(token)}`;
}

export function toolsBookingStaffPath(): string {
  return '/tyokalut/varaus';
}

export async function ensureCompanyToolsBookingToken(): Promise<string> {
  const { data, error } = await supabase.rpc('ensure_company_tools_booking_token');
  if (error) throw new Error(error.message);
  const token = typeof data === 'string' ? data.trim() : '';
  if (!token) throw new Error('Varauslinkin luonti epäonnistui.');
  return token;
}

export async function loadToolsBookingPublic(token: string): Promise<ToolBookingPublicBundle> {
  const { data, error } = await supabase.rpc('get_tools_booking_public', { p_token: token });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object') throw new Error('Varauskalenterin lataus epäonnistui.');
  return data as ToolBookingPublicBundle;
}

export type CreatePublicToolBookingInput = {
  token: string;
  toolId: string;
  startsAt: string;
  endsAt: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  deliveryMode?: ToolBookingDeliveryMode;
  deliveryDistanceKm?: number | null;
  deliveryAddress?: string;
  notes?: string;
};

export async function createPublicToolBooking(input: CreatePublicToolBookingInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_tool_booking_public', {
    p_token: input.token,
    p_tool_id: input.toolId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_guest_name: input.guestName,
    p_guest_phone: input.guestPhone ?? null,
    p_guest_email: input.guestEmail ?? null,
    p_delivery_mode: input.deliveryMode ?? 'none',
    p_delivery_distance_km: input.deliveryDistanceKm ?? null,
    p_delivery_address: input.deliveryAddress ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message);
  const id = typeof data === 'string' ? data : String(data ?? '');
  if (!id) throw new Error('Varauksen tallennus epäonnistui.');
  return id;
}

export async function fetchCompanyDeliverySettings(
  companyId: string,
): Promise<CompanyToolsDeliverySettings | null> {
  const { data, error } = await supabase
    .from('companies')
    .select(
      'tools_booking_token, tools_booking_enabled, delivery_enabled, pickup_enabled, delivery_min_fee_eur, delivery_distance_limit_km, delivery_per_km_eur',
    )
    .eq('id', companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as CompanyToolsDeliverySettings;
}

export async function saveCompanyDeliverySettings(
  companyId: string,
  settings: Partial<CompanyToolsDeliverySettings>,
): Promise<void> {
  const { error } = await supabase.from('companies').update(settings).eq('id', companyId);
  if (error) throw new Error(error.message);
}

export async function fetchCompanyToolBookings(companyId: string): Promise<ToolBooking[]> {
  const { data, error } = await supabase
    .from('tool_bookings')
    .select(
      `
      id, company_id, tool_id, status, starts_at, ends_at,
      guest_name, guest_phone, guest_email,
      delivery_mode, delivery_distance_km, delivery_fee_eur, delivery_address, notes,
      confirmed_loan_id, created_at, updated_at,
      tool:tools!tool_bookings_tool_id_fkey(name, tag_id, serial_number)
    `,
    )
    .eq('company_id', companyId)
    .order('starts_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data as unknown as ToolBooking[]) ?? [];
}

export async function updateToolBookingStatus(
  bookingId: string,
  status: 'pending' | 'confirmed' | 'cancelled',
): Promise<void> {
  const { error } = await supabase.from('tool_bookings').update({ status }).eq('id', bookingId);
  if (error) throw new Error(error.message);
}

export type CreatePublicToolBookingsResult = {
  ids: string[];
  createdToolIds: string[];
  failures: { toolId: string; error: string }[];
};

/** One tool_bookings row per free tool (existing RPC); continues on per-tool conflicts. */
export async function createPublicToolBookings(
  input: Omit<CreatePublicToolBookingInput, 'toolId'> & { toolIds: string[] },
): Promise<CreatePublicToolBookingsResult> {
  const ids: string[] = [];
  const createdToolIds: string[] = [];
  const failures: { toolId: string; error: string }[] = [];
  const uniqueIds = [...new Set(input.toolIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error('Valitse vähintään yksi työkalu.');
  }
  for (const toolId of uniqueIds) {
    try {
      const id = await createPublicToolBooking({ ...input, toolId });
      ids.push(id);
      createdToolIds.push(toolId);
    } catch (err) {
      failures.push({
        toolId,
        error: err instanceof Error ? err.message : 'Varaus epäonnistui.',
      });
    }
  }
  if (ids.length === 0) {
    const first = failures[0]?.error;
    throw new Error(first || 'Varauksen tallennus epäonnistui.');
  }
  return { ids, createdToolIds, failures };
}
