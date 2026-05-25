export type BreadcrumbItem = {
  label: string;
  to?: string;
};

export type NavigationTrailState = {
  breadcrumb: BreadcrumbItem[];
  backTo: string;
};

export const NAV_TRAIL_STATE_KEY = 'navTrail';

export function homeTrail(): NavigationTrailState {
  return {
    breadcrumb: [{ label: 'Etusivu', to: '/' }],
    backTo: '/',
  };
}

export function maintenanceListTrail(): NavigationTrailState {
  return {
    breadcrumb: [
      { label: 'Etusivu', to: '/' },
      { label: 'Huoltoraportit', to: '/huoltoraportit' },
    ],
    backTo: '/huoltoraportit',
  };
}

export function quoteListTrail(): NavigationTrailState {
  return {
    breadcrumb: [
      { label: 'Etusivu', to: '/' },
      { label: 'Tarjouspyyntö', to: '/tarjouspyynnot' },
      { label: 'Lista', to: '/tarjouspyynnot/lista' },
    ],
    backTo: '/tarjouspyynnot/lista',
  };
}

export function customersListTrail(): NavigationTrailState {
  return {
    breadcrumb: [
      { label: 'Etusivu', to: '/' },
      { label: 'Asiakkaat', to: '/asiakkaat' },
    ],
    backTo: '/asiakkaat',
  };
}

export function customerDetailTrail(customerId: string, customerName: string): NavigationTrailState {
  return {
    breadcrumb: [
      { label: 'Etusivu', to: '/' },
      { label: 'Asiakkaat', to: '/asiakkaat' },
      { label: customerName, to: `/asiakkaat/${customerId}` },
    ],
    backTo: `/asiakkaat/${customerId}`,
  };
}

export function equipmentDetailTrail(
  customerId: string,
  customerName: string,
  equipmentLabel: string,
): NavigationTrailState {
  return {
    breadcrumb: [
      { label: 'Etusivu', to: '/' },
      { label: 'Asiakkaat', to: '/asiakkaat' },
      { label: customerName, to: `/asiakkaat/${customerId}` },
      { label: equipmentLabel },
    ],
    backTo: `/asiakkaat/${customerId}`,
  };
}

export function appendPage(trail: NavigationTrailState, label: string): BreadcrumbItem[] {
  return [...trail.breadcrumb, { label }];
}

export function withNavTrail(trail: NavigationTrailState) {
  return { state: { [NAV_TRAIL_STATE_KEY]: trail } };
}

export function readNavTrail(state: unknown): NavigationTrailState | null {
  if (!state || typeof state !== 'object') return null;
  const candidate = (state as Record<string, unknown>)[NAV_TRAIL_STATE_KEY];
  if (!candidate || typeof candidate !== 'object') return null;
  const trail = candidate as NavigationTrailState;
  if (!Array.isArray(trail.breadcrumb) || typeof trail.backTo !== 'string') return null;
  return trail;
}

export function inferMaintenanceReportTrail(input: {
  inherited: NavigationTrailState | null;
  customerId: string | null;
  customerName: string | null;
  pageLabel: string;
}): { breadcrumb: BreadcrumbItem[]; backTo: string; trail: NavigationTrailState } {
  const base =
    input.inherited ??
    (input.customerId && input.customerName
      ? customerDetailTrail(input.customerId, input.customerName)
      : maintenanceListTrail());

  const breadcrumb = appendPage(base, input.pageLabel);
  return { breadcrumb, backTo: base.backTo, trail: base };
}

const NAV_TRAIL_STORAGE_PREFIX = 'bc-navTrail:';

export function persistNavTrail(key: string, trail: NavigationTrailState) {
  try {
    sessionStorage.setItem(`${NAV_TRAIL_STORAGE_PREFIX}${key}`, JSON.stringify(trail));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readPersistedNavTrail(key: string): NavigationTrailState | null {
  try {
    const raw = sessionStorage.getItem(`${NAV_TRAIL_STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NavigationTrailState;
    if (!Array.isArray(parsed.breadcrumb) || typeof parsed.backTo !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}
