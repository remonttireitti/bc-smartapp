import { subscriberPortalReportVisible } from './subscriberPortalVisibility';
import type { Profile } from '../types';

export type SubscriberPortalPreview = {
  kind: 'subscriber';
  subscriberId: string;
  subscriberName: string;
  companyId: string;
};

export type CustomerPortalPreview = {
  kind: 'customer';
  customerId: string;
  customerName: string;
  companyId: string;
};

export type PortalPreviewState = SubscriberPortalPreview | CustomerPortalPreview;

const STORAGE_KEY = 'bc-smartapp.portal-preview.v1';
export const PORTAL_PREVIEW_EVENT = 'bc-portal-preview-change';

export function setPortalPreview(state: PortalPreviewState) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(PORTAL_PREVIEW_EVENT));
}

export function getPortalPreview(): PortalPreviewState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortalPreviewState;
    if (parsed.kind === 'subscriber' && parsed.subscriberId && parsed.companyId) {
      return parsed;
    }
    if (parsed.kind === 'customer' && parsed.customerId && parsed.companyId) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

const RETURN_KEY = 'bc-smartapp.portal-preview-return.v1';

/** Muista mistä esikatselu avattiin (Poistu esikatselusta palaa sinne). */
export function rememberPortalPreviewReturn(path: string) {
  try { sessionStorage.setItem(RETURN_KEY, path); } catch { /* ignore */ }
}

export function takePortalPreviewReturn(): string {
  try {
    const v = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return v && v.startsWith('/') && !v.startsWith('/esikatselu') ? v : '/';
  } catch {
    return '/';
  }
}

export function clearPortalPreview() {
  sessionStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(PORTAL_PREVIEW_EVENT));
}

export function isPortalPreviewActive() {
  return getPortalPreview() !== null;
}

export function isPortalView(profile: Pick<Profile, 'role'> | null | undefined) {
  if (profile?.role === 'subscriber' || profile?.role === 'customer') return true;
  return isPortalPreviewActive();
}

/** @alias isPortalView */
export const isPortalUser = isPortalView;

export function getPortalSubscriberId(profile: Pick<Profile, 'role' | 'subscriber_id'> | null | undefined) {
  if (profile?.role === 'subscriber' && profile.subscriber_id) return profile.subscriber_id;
  const preview = getPortalPreview();
  return preview?.kind === 'subscriber' ? preview.subscriberId : null;
}

export function getPortalCustomerId(profile: Pick<Profile, 'role' | 'customer_id'> | null | undefined) {
  if (profile?.role === 'customer' && profile.customer_id) return profile.customer_id;
  const preview = getPortalPreview();
  return preview?.kind === 'customer' ? preview.customerId : null;
}

export function getPortalPreviewLabel(): string | null {
  const preview = getPortalPreview();
  if (!preview) return null;
  return preview.kind === 'subscriber' ? preview.subscriberName : preview.customerName;
}

/** Admin esikatselu: RLS näyttää kaiken — suodata clientillä kuten tilaaja näkisi. */
export function needsPortalClientFilter(profile: Pick<Profile, 'role'> | null | undefined) {
  // Kun esikatselua avataan yrityksen tunnuksilla (ei tilaaja/asiakas-roolilla),
  // RLS ei vielä tunne tilaajan identiteettiä, joten suodatetaan client-puolella.
  return isPortalPreviewActive() && profile?.role !== 'subscriber' && profile?.role !== 'customer';
}

type PortalSubscriberReportRef = {
  subscriber_id?: string | null;
  customer_id?: string | null;
  customers?: unknown;
};

function customerSubscriberIdFromReport(report: PortalSubscriberReportRef): string | null {
  const customers = report.customers;
  if (!customers || typeof customers !== 'object') return null;
  if (Array.isArray(customers)) {
    const first = customers[0];
    if (!first || typeof first !== 'object' || !('subscriber_id' in first)) return null;
    return (first as { subscriber_id?: string | null }).subscriber_id ?? null;
  }
  if (!('subscriber_id' in customers)) return null;
  return (customers as { subscriber_id?: string | null }).subscriber_id ?? null;
}

export function reportMatchesPortalSubscriber(
  report: PortalSubscriberReportRef,
  subscriberId: string,
  customerIdsForSubscriber?: ReadonlySet<string>,
) {
  if (report.subscriber_id === subscriberId) return true;
  if (customerSubscriberIdFromReport(report) === subscriberId) return true;
  if (report.customer_id && customerIdsForSubscriber?.has(report.customer_id)) return true;
  return false;
}

export function filterMaintenanceReportsForPortalView<
  T extends PortalSubscriberReportRef & {
    status: string;
    id?: string;
    subscriber_portal_visibility?: string | null;
  },
>(
  reports: T[],
  profile: Pick<Profile, 'role' | 'subscriber_id' | 'customer_id'> | null | undefined,
  customerIdsForSubscriber?: ReadonlySet<string>,
): T[] {
  if (!isPortalView(profile)) return reports;

  let list = reports.filter((r) =>
    subscriberPortalReportVisible({
      kind: 'maintenance',
      visibility: r.subscriber_portal_visibility,
      status: r.status,
    }),
  );

  const subscriberId = getPortalSubscriberId(profile);
  const customerId = getPortalCustomerId(profile);

  if (subscriberId && needsPortalClientFilter(profile)) {
    list = list.filter((r) => reportMatchesPortalSubscriber(r, subscriberId, customerIdsForSubscriber));
  } else if (customerId && needsPortalClientFilter(profile)) {
    list = list.filter((r) => r.customer_id === customerId);
  }

  return list;
}

export function filterCustomersForPortalView<
  T extends { id: string; subscriber_id?: string | null },
>(customers: T[], profile: Pick<Profile, 'role' | 'subscriber_id' | 'customer_id'> | null | undefined): T[] {
  const subscriberId = getPortalSubscriberId(profile);
  const customerId = getPortalCustomerId(profile);
  if (!isPortalView(profile)) return customers;
  if (subscriberId && needsPortalClientFilter(profile)) {
    return customers.filter((c) => c.subscriber_id === subscriberId);
  }
  if (customerId && needsPortalClientFilter(profile)) {
    return customers.filter((c) => c.id === customerId);
  }
  return customers;
}

/** Portaalissa sallitut reitit — henkilöstön näkymät (asiakaslista, valitsimet, hallinta) eivät ole saatavilla. */
export function isPortalRouteAllowed(pathname: string): boolean {
  if (pathname === '/') return true;
  if (pathname === '/asiakkaat') return false;
  const allowed = [
    '/tyoraportit', '/laitteet', '/huoltoraportit', '/tarjoukset', '/tiedostot', '/esikatselu/',
    '/vaihda-salasana', '/aseta-uusi-salasana', '/j/', '/tyoraportti/jako/', '/asiakkaat/',
  ];
  if (pathname.startsWith('/tarjouspyynnot/') && pathname.endsWith('/tuloste')) return true;
  if (pathname.startsWith('/etaseuranta/lampotila/raportit/') && pathname.endsWith('/tuloste')) return true;
  if (pathname === '/tyoraportit/uusi' || pathname.startsWith('/tyoraportit/toimeksianto') || /^\/tyoraportit\/[^/]+\/muokkaa$/.test(pathname)) return false;
  if (pathname === '/huoltoraportit/uusi' || pathname.startsWith('/huoltoraportit/valitse') || pathname.startsWith('/huoltoraportit/uusi/')) return false;
  return allowed.some((p) => pathname.startsWith(p));
}

/** Portaali: muokattavat näkymät ohjataan asiakastulosteeseen / laitekorttiin. */
export function portalRedirectFor(pathname: string): string | null {
  let m = pathname.match(/^\/tyoraportit\/([0-9a-f-]{36})\/?$/);
  if (m) return `/tyoraportit/${m[1]}/tuloste`;
  m = pathname.match(/^\/tyoraportit\/([0-9a-f-]{36})\/(muokkaa|laskutus.*)$/);
  if (m) return `/tyoraportit/${m[1]}/tuloste`;
  m = pathname.match(/^\/huoltoraportit\/([0-9a-f-]{36})\/?$/);
  if (m) return `/huoltoraportit/${m[1]}/tuloste`;
  m = pathname.match(/^\/tarjouspyynnot\/([0-9a-f-]{36})\/?$/);
  if (m) return `/tarjouspyynnot/${m[1]}/tuloste`;
  m = pathname.match(/^\/asiakkaat\/[0-9a-f-]{36}\/laitteet\/([0-9a-f-]{36})/);
  if (m) return `/laitteet/${m[1]}`;
  if (pathname === '/asiakkaat') return '/laitteet';
  return null;
}
