import { isMaintenanceReportPublished } from './maintenanceReportStatus';

/**
 * Kausihuolto ei ole oma sarake. maintenance_reports.data on vapaa JSON,
 * eikä kannassa ole kevät/syksy-kenttää. Kausi luetaan vain eksplisiittisestä
 * metatiedosta (kenttä tai ilmaus "Keväthuolto" / "Syyshuolto").
 * Huoltopäivä, luontiaika tai korjaus ei tee rivistä kausihuoltoa eikä
 * vanhoja rivejä kirjoiteta uudelleen.
 */

export type MaintenanceSeason = 'kevat' | 'syksy';

export const MAINTENANCE_SEASON_ORDER: readonly MaintenanceSeason[] = ['syksy', 'kevat'];

export const MAINTENANCE_SEASON_LABELS: Record<MaintenanceSeason, string> = {
  syksy: 'Syyshuolto',
  kevat: 'Keväthuolto',
};

export type SeasonDeviceStatus = 'not_started' | 'started' | 'done';

export const SEASON_DEVICE_STATUS_LABELS: Record<SeasonDeviceStatus, string> = {
  not_started: 'Ei aloitettu',
  started: 'Aloitettu',
  done: 'Valmis',
};

export type ExplicitMaintenanceSeason = {
  season: MaintenanceSeason;
  /** null = kautta ei ole sidottu vuoteen. Kuukaudesta ei arvata. */
  year: number | null;
  source: 'field' | 'label';
};

export type MaintenanceProtocolRef = {
  id: string;
  equipmentId?: string | null;
  status?: string | null;
  title?: string | null;
  data?: unknown;
  serviceDate?: string | null;
  createdAt?: string | null;
};

export type MaintenanceProtocolView = {
  id: string;
  equipmentId: string | null;
  status: string;
  published: boolean;
  title: string;
  dateYmd: string | null;
  season: ExplicitMaintenanceSeason | null;
};

export type MaintenanceYearGroup = {
  year: number | null;
  seasons: Array<{
    season: MaintenanceSeason;
    label: string;
    protocols: MaintenanceProtocolView[];
  }>;
  other: MaintenanceProtocolView[];
};

export type SeasonDeviceRow = {
  deviceId: string;
  label: string;
  deviceType: string | null;
  status: SeasonDeviceStatus;
  protocols: MaintenanceProtocolView[];
};

const SEASON_FIELD_KEYS = [
  'huoltokausi',
  'huoltoKausi',
  'kausihuolto',
  'kausi',
  'season',
  'maintenanceSeason',
  'huoltoSeason',
  'huoltosesonki',
] as const;

const YEAR_FIELD_KEYS = [
  'huoltokausiVuosi',
  'huoltoVuosi',
  'kausiVuosi',
  'seasonYear',
  'maintenanceYear',
  'vuosi',
] as const;

const LABEL_FIELD_KEYS = ['laiteKayttotarkoitus', 'otsikko', 'huoltoOtsikko', 'title'] as const;

const SEASON_LABEL_RE = /(kevät|kevat|syys)\s*-?\s*huolto/i;

function fold(value: string): string {
  return value.trim().toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/å/g, 'a');
}

export function parseMaintenanceSeasonToken(value: unknown): MaintenanceSeason | null {
  if (value == null || typeof value === 'boolean') return null;
  if (typeof value === 'object') return null;
  const s = fold(String(value));
  if (!s) return null;
  if (s === 'kevat' || s === 'kevathuolto' || s === 'spring') return 'kevat';
  if (s === 'syksy' || s === 'syys' || s === 'syyshuolto' || s === 'autumn' || s === 'fall') return 'syksy';
  const label = s.match(SEASON_LABEL_RE);
  if (!label) return null;
  return fold(label[1]).startsWith('sy') ? 'syksy' : 'kevat';
}

export function parseMaintenanceSeasonYear(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value >= 1990 && value <= 2100 ? value : null;
  }
  const s = String(value ?? '').trim();
  if (!/^\d{4}$/.test(s)) return null;
  const year = Number(s);
  return year >= 1990 && year <= 2100 ? year : null;
}

function yearFromYmd(value: string | null | undefined): number | null {
  const s = String(value ?? '').trim();
  const m = s.match(/^(\d{4})-\d{2}-\d{2}/);
  return m ? parseMaintenanceSeasonYear(m[1]) : null;
}

function yearInLabel(label: string): number | null {
  const m = label.match(/\b((?:19|20)\d{2})\b/);
  return m ? parseMaintenanceSeasonYear(m[1]) : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readSeasonFromValue(value: unknown): { season: MaintenanceSeason; year: number | null } | null {
  const direct = parseMaintenanceSeasonToken(value);
  if (direct) return { season: direct, year: yearInLabel(String(value ?? '')) };
  const rec = asRecord(value);
  if (!rec) return null;
  let season: MaintenanceSeason | null = null;
  let year: number | null = null;
  for (const key of [...SEASON_FIELD_KEYS, 'kausi', 'season']) {
    season = parseMaintenanceSeasonToken(rec[key]);
    if (season) break;
  }
  for (const key of YEAR_FIELD_KEYS) {
    year = parseMaintenanceSeasonYear(rec[key]);
    if (year) break;
  }
  return season ? { season, year } : null;
}

function serviceDateFromData(data: Record<string, unknown> | null, fallback?: string | null): string | null {
  const candidates = [data?.huoltoPaivamaara, data?.tarkastusPvm, fallback];
  for (const candidate of candidates) {
    const s = String(candidate ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const fi = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (fi) return `${fi[3]}-${fi[2].padStart(2, '0')}-${fi[1].padStart(2, '0')}`;
  }
  return null;
}

/**
 * Eksplisiittinen kausi. Palauttaa null, jos rivissä ei ole kausikenttää eikä
 * Keväthuolto/Syyshuolto-ilmausta. Päivämäärää ei käytetä kauden päättelyyn.
 */
export function readExplicitMaintenanceSeason(input: {
  data?: unknown;
  title?: string | null;
  serviceDate?: string | null;
  createdAt?: string | null;
}): ExplicitMaintenanceSeason | null {
  const data = asRecord(input.data);
  let fromField: { season: MaintenanceSeason; year: number | null } | null = null;
  if (data) {
    for (const key of SEASON_FIELD_KEYS) {
      fromField = readSeasonFromValue(data[key]);
      if (fromField) break;
    }
    if (fromField && fromField.year == null) {
      for (const key of YEAR_FIELD_KEYS) {
        const year = parseMaintenanceSeasonYear(data[key]);
        if (year) {
          fromField = { ...fromField, year };
          break;
        }
      }
    }
  }

  let fromLabel: { season: MaintenanceSeason; year: number | null; text: string } | null = null;
  const labels = [input.title, ...LABEL_FIELD_KEYS.map((key) => (data ? data[key] : null))];
  for (const raw of labels) {
    const text = String(raw ?? '');
    const season = parseMaintenanceSeasonToken(text.match(SEASON_LABEL_RE)?.[0] ?? '');
    if (!season) continue;
    fromLabel = { season, year: yearInLabel(text), text };
    break;
  }

  const picked = fromField
    ? { season: fromField.season, year: fromField.year, source: 'field' as const }
    : fromLabel
      ? { season: fromLabel.season, year: fromLabel.year, source: 'label' as const }
      : null;
  if (!picked) return null;

  if (picked.year == null && fromLabel?.year && picked.source === 'field') {
    picked.year = fromLabel.year;
  }
  if (picked.year == null) {
    const dated = serviceDateFromData(data, input.serviceDate) ?? input.createdAt;
    picked.year = yearFromYmd(dated);
  }
  return picked;
}

export function maintenanceSeasonFromSearch(params: { get(name: string): string | null }): {
  season: MaintenanceSeason;
  year: number;
} | null {
  const season = parseMaintenanceSeasonToken(params.get('huoltokausi'));
  const year = parseMaintenanceSeasonYear(params.get('huoltokausiVuosi'));
  if (!season || !year) return null;
  return { season, year };
}

export function maintenanceProtocolVisibleToPortal(status: string | null | undefined): boolean {
  return isMaintenanceReportPublished(status);
}

export function toMaintenanceProtocolView(row: MaintenanceProtocolRef): MaintenanceProtocolView {
  const data = asRecord(row.data);
  const dateYmd = serviceDateFromData(data, row.serviceDate) ?? yearDate(row.createdAt);
  const title = String(row.title ?? data?.title ?? '').trim() || 'Huoltopöytäkirja';
  return {
    id: row.id,
    equipmentId: row.equipmentId ?? null,
    status: String(row.status ?? ''),
    published: isMaintenanceReportPublished(row.status),
    title,
    dateYmd,
    season: readExplicitMaintenanceSeason({
      data: row.data,
      title: row.title,
      serviceDate: dateYmd,
      createdAt: row.createdAt,
    }),
  };
}

function yearDate(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

function byDateDesc(a: MaintenanceProtocolView, b: MaintenanceProtocolView): number {
  const av = a.dateYmd ?? '';
  const bv = b.dateYmd ?? '';
  if (av !== bv) return av < bv ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function protocolsForAudience(
  rows: readonly MaintenanceProtocolRef[],
  audience: 'portal' | 'installer',
): MaintenanceProtocolView[] {
  const views = rows.map((row) => toMaintenanceProtocolView(row));
  if (audience === 'installer') return views;
  return views.filter((row) => row.published);
}

export function groupMaintenanceProtocols(
  rows: readonly MaintenanceProtocolView[],
  options?: { currentYear?: number },
): MaintenanceYearGroup[] {
  const buckets = new Map<string, { year: number | null; seasons: Record<MaintenanceSeason, MaintenanceProtocolView[]>; other: MaintenanceProtocolView[] }>();
  const ensure = (year: number | null) => {
    const key = year == null ? 'unknown' : String(year);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { year, seasons: { syksy: [], kevat: [] }, other: [] };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  if (options?.currentYear) ensure(options.currentYear);

  for (const row of rows) {
    if (row.season) {
      ensure(row.season.year).seasons[row.season.season].push(row);
    } else {
      ensure(yearFromYmd(row.dateYmd)).other.push(row);
    }
  }

  return [...buckets.values()]
    .map((bucket) => ({
      year: bucket.year,
      seasons: MAINTENANCE_SEASON_ORDER.map((season) => ({
        season,
        label: MAINTENANCE_SEASON_LABELS[season],
        protocols: [...bucket.seasons[season]].sort(byDateDesc),
      })),
      other: [...bucket.other].sort(byDateDesc),
    }))
    .sort((a, b) => {
      if (a.year == null) return 1;
      if (b.year == null) return -1;
      return b.year - a.year;
    });
}

export function seasonDeviceRows(input: {
  devices: readonly { id: string; label: string; deviceType?: string | null }[];
  protocols: readonly MaintenanceProtocolView[];
  year: number;
  season: MaintenanceSeason;
}): SeasonDeviceRow[] {
  return [...input.devices]
    .map((device) => {
      const protocols = input.protocols
        .filter(
          (row) =>
            row.equipmentId === device.id
            && row.season?.season === input.season
            && row.season.year === input.year,
        )
        .sort(byDateDesc);
      const status: SeasonDeviceStatus = protocols.some((row) => row.published)
        ? 'done'
        : protocols.length > 0
          ? 'started'
          : 'not_started';
      return {
        deviceId: device.id,
        label: device.label,
        deviceType: device.deviceType ?? null,
        status,
        protocols,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'fi'));
}

/** Avoin luonnos kelpaa kausihuollon jatkoksi vain, jos siinä on sama eksplisiittinen kausi ja vuosi. */
export function draftMatchesMaintenanceSeason(data: unknown, season: MaintenanceSeason, year: number): boolean {
  const explicit = readExplicitMaintenanceSeason({ data });
  return explicit?.season === season && explicit?.year === year;
}
