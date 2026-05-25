import type { HeatPumpDevice } from '../../data/pumpDeviceCatalog';
import type { QuoteRequestData } from './types';

export type TermatekAssetKey =
  | 'logo'
  | 'header'
  | 'coverBg'
  | 'q1'
  | 'q2'
  | 'q3'
  | 'q4'
  | 'sensiraIndoor'
  | 'sensiraOutdoor'
  | 'iilpOutdoorGeneric'
  | 'iilpSensiraIndoor'
  | 'iilpPerferaIndoor'
  | 'iilpEmuraWhite'
  | 'iilpStylishWhite'
  | 'iilpStylishBlack'
  | 'iilpStylishSilver'
  | 'iilpNepuraIndoor'
  | 'iilpComforaIndoor'
  | 'iilpComforaOutdoor'
  | 'iilpUruruSararaIndoor'
  | 'iilpFloorConsole'
  | 'vilpOutdoor'
  | 'vilpOutdoorAltherma3'
  | 'vilpIndoorHydroboxEpbx'
  | 'vilpIndoorHydroboxElbx'
  | 'vilpIndoorFloor'
  | 'vilpIndoorIntegratedTower'
  | 'vilpHydrobox'
  | 'vilpTank'
  | 'inventorVilpOutdoorSingle'
  | 'inventorVilpOutdoorDouble'
  | 'inventorIilpOutdoor'
  | 'inventorIilpAriaIndoor'
  | 'inventorIilpNeoIndoor'
  | 'inventorIilpNeoEcoIndoor'
  | 'inventorIilpLeonIndoor'
  | 'inventorIilpLeonIndoor09'
  | 'inventorIilpLeonIndoor12'
  | 'inventorIilpLeonIndoor18'
  | 'inventorIilpLeonIndoor24'
  | 'inventorIilpLeonOutdoor09'
  | 'inventorIilpLeonOutdoor18'
  | 'inventorIilpLeonOutdoor24'
  | 'inventorIilpEmperorIndoor'
  | 'inventorIilpThoraIndoor'
  | 'samsungVilpOutdoor'
  | 'samsungVilpHydrobox'
  | 'samsungVilpTank';

export type TermatekAssetMap = Record<TermatekAssetKey, string>;

export type TermatekProductImage = { label: string; src: string; alt: string };

export function getTermatekAssetBase(origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  const viteBaseUrl = import.meta.env.BASE_URL ?? '/';
  const basePrefix = viteBaseUrl && viteBaseUrl !== '/' ? String(viteBaseUrl).replace(/\/$/, '') : '';
  return `${origin}${basePrefix}`;
}

export function buildTermatekAssetMap(assetBase: string): TermatekAssetMap {
  const p = (path: string) => `${assetBase}/termatek/${path}`;
  return {
    logo: p('logo_transparent.png'),
    header: p('header_bar.png'),
    coverBg: p('cover_bg.png'),
    q1: p('cover_q1.png'),
    q2: p('cover_q2.png'),
    q3: p('cover_q3.png'),
    q4: p('cover_q4.png'),
    sensiraIndoor: p('sensira_indoor.png'),
    sensiraOutdoor: p('sensira_outdoor.png'),
    iilpOutdoorGeneric: p('daikin/iilp_outdoor_generic.png'),
    iilpSensiraIndoor: p('daikin/iilp_sensira_indoor.png'),
    iilpPerferaIndoor: p('daikin/iilp_perfera_indoor.png'),
    iilpEmuraWhite: p('daikin/iilp_emura_white.png'),
    iilpStylishWhite: p('daikin/iilp_stylish_white.png'),
    iilpStylishBlack: p('daikin/iilp_stylish_black.png'),
    iilpStylishSilver: p('daikin/iilp_stylish_silver.png'),
    iilpNepuraIndoor: p('daikin/iilp_nepura_indoor.png'),
    iilpComforaIndoor: p('daikin/iilp_comfora_indoor.jpeg'),
    iilpComforaOutdoor: p('daikin/iilp_comfora_outdoor.jpeg'),
    iilpUruruSararaIndoor: p('daikin/iilp_ururu_sarara_indoor.png'),
    iilpFloorConsole: p('daikin/iilp_floor_console.png'),
    vilpOutdoor: p('daikin/vilp_outdoor.png'),
    vilpOutdoorAltherma3: p('daikin/vilp_outdoor_altherma3.png'),
    vilpIndoorHydroboxEpbx: p('daikin/vilp_indoor_hydrobox_epbx.jpg'),
    vilpIndoorHydroboxElbx: p('daikin/vilp_indoor_hydrobox_elbx.jpg'),
    vilpIndoorFloor: p('daikin/vilp_indoor_floor_ehvx.jpg'),
    vilpIndoorIntegratedTower: p('daikin/vilp_indoor_integrated_tower.jpg'),
    vilpHydrobox: p('daikin/vilp_hydrobox.png'),
    vilpTank: p('daikin/vilp_tank.png'),
    inventorVilpOutdoorSingle: p('inventor/vilp_outdoor_single.png'),
    inventorVilpOutdoorDouble: p('inventor/vilp_outdoor_double.png'),
    inventorIilpOutdoor: p('inventor/iilp_outdoor.png'),
    inventorIilpAriaIndoor: p('inventor/iilp_aria_indoor.png'),
    inventorIilpNeoIndoor: p('inventor/iilp_neo_indoor.png'),
    inventorIilpNeoEcoIndoor: p('inventor/iilp_neoeco_indoor.png'),
    inventorIilpLeonIndoor: p('inventor/iilp_leon_indoor.png'),
    inventorIilpLeonIndoor09: p('inventor/iilp_leon_indoor_09.png'),
    inventorIilpLeonIndoor12: p('inventor/iilp_leon_indoor_12.png'),
    inventorIilpLeonIndoor18: p('inventor/iilp_leon_indoor_18.png'),
    inventorIilpLeonIndoor24: p('inventor/iilp_leon_indoor_24.png'),
    inventorIilpLeonOutdoor09: p('inventor/iilp_leon_outdoor.png'),
    inventorIilpLeonOutdoor18: p('inventor/iilp_leon_outdoor_18.png'),
    inventorIilpLeonOutdoor24: p('inventor/iilp_leon_outdoor_24.png'),
    inventorIilpEmperorIndoor: p('inventor/iilp_emperor_indoor.png'),
    inventorIilpThoraIndoor: p('inventor/iilp_thora_indoor.png'),
    samsungVilpOutdoor: p('samsung/vilp_outdoor_r290.png'),
    samsungVilpHydrobox: p('samsung/vilp_hydrobox.png'),
    samsungVilpTank: p('samsung/vilp_tank.png'),
  };
}

function applyRegistryProductImageUrls(
  images: TermatekProductImage[],
  device: HeatPumpDevice | null | undefined,
): TermatekProductImage[] {
  if (!device) return images;
  const inUrl = device.registryImageUrlIndoor;
  const outUrl = device.registryImageUrlOutdoor;
  if (!inUrl && !outUrl) return images;
  return images.map((img) => {
    if (inUrl && (img.label === 'Sisäyksikkö' || img.alt === 'Sisäyksikkö')) return { ...img, src: inUrl };
    if (outUrl && (img.label === 'Ulkoyksikkö' || img.alt === 'Ulkoyksikkö')) return { ...img, src: outUrl };
    return img;
  });
}

export function resolveTermatekProductImages(input: {
  quoteType: QuoteRequestData['type'];
  data: QuoteRequestData;
  device: HeatPumpDevice | null;
  assets: TermatekAssetMap;
  productTitle: string;
}): TermatekProductImage[] {
  const { quoteType, data, device, assets, productTitle } = input;
  const deviceNameLower = (device?.name || productTitle || '').toLowerCase();
  const deviceModelLower = (device?.model || '').toLowerCase();
  const deviceIdLower = (device?.id || '').toLowerCase();
  const isSensira = deviceNameLower.includes('sensira');

  const pickVilpOutdoorSrc = (): string => {
    if (
      (device?.brand || '').toLowerCase() === 'samsung'
      || deviceNameLower.includes('samsung')
      || deviceModelLower.includes('ae160cxy')
      || deviceModelLower.includes('ae160dn')
      || deviceModelLower.includes('ae200dn')
    ) {
      return assets.samsungVilpOutdoor;
    }
    if (deviceModelLower.includes('mx290')) {
      if (deviceModelLower.includes('-16t') || deviceModelLower.includes('-40t')) {
        return assets.inventorVilpOutdoorDouble || assets.inventorVilpOutdoorSingle;
      }
      return assets.inventorVilpOutdoorSingle;
    }
    if (deviceModelLower.includes('ats') || deviceNameLower.includes('matrix split')) {
      return assets.inventorVilpOutdoorSingle || assets.vilpOutdoor;
    }
    if (deviceModelLower.includes('epsk')) return assets.vilpOutdoor;
    if (deviceModelLower.includes('erra') || deviceModelLower.includes('erga') || deviceModelLower.includes('epra')) {
      return assets.vilpOutdoorAltherma3;
    }
    return assets.vilpOutdoor || assets.vilpOutdoorAltherma3;
  };

  const pickVilpIndoorSrc = (): string => {
    if (
      (device?.brand || '').toLowerCase() === 'samsung'
      || deviceNameLower.includes('samsung')
      || deviceModelLower.includes('ae160cxy')
      || deviceModelLower.includes('ae160dn')
      || deviceModelLower.includes('ae200dn')
    ) {
      const preferIntegrated = data.vilpIndoorConfig === 'integroitu' || deviceModelLower.includes('ae200dn');
      return preferIntegrated ? assets.samsungVilpTank : assets.samsungVilpHydrobox;
    }
    if (deviceModelLower.includes('mx290')) return '';
    const preferIntegrated = data.vilpIndoorConfig === 'integroitu';
    if (preferIntegrated) {
      if (deviceModelLower.includes('ehvx')) return assets.vilpIndoorFloor || assets.vilpIndoorIntegratedTower;
      return assets.vilpIndoorIntegratedTower || assets.vilpIndoorFloor;
    }
    if (deviceModelLower.includes('epbx')) return assets.vilpIndoorHydroboxEpbx || assets.vilpHydrobox;
    if (deviceModelLower.includes('elbx') || deviceModelLower.includes('etbx')) {
      return assets.vilpIndoorHydroboxElbx || assets.vilpHydrobox;
    }
    if (deviceModelLower.includes('hu') || deviceNameLower.includes('hydrobox')) {
      return assets.vilpHydrobox;
    }
    return assets.vilpHydrobox;
  };

  const pickIilpIndoorSrc = (): string => {
    const isInventor =
      deviceNameLower.includes('inventor')
      || deviceModelLower.includes('ar5vi-')
      || deviceModelLower.includes('n2uvi-')
      || deviceModelLower.includes('necuvi-')
      || deviceModelLower.includes('lhuvi-')
      || deviceModelLower.includes('empvi-')
      || deviceModelLower.includes('thrvi-');

    if (isInventor) {
      if (deviceModelLower.includes('ar5vi-')) return assets.inventorIilpAriaIndoor;
      if (deviceModelLower.includes('n2uvi-')) return assets.inventorIilpNeoIndoor;
      if (deviceModelLower.includes('necuvi-')) return assets.inventorIilpNeoEcoIndoor;
      if (deviceModelLower.includes('lhuvi-')) {
        if (deviceModelLower.includes('-09') || deviceModelLower.includes('09w')) return assets.inventorIilpLeonIndoor09;
        if (deviceModelLower.includes('-12') || deviceModelLower.includes('12w')) return assets.inventorIilpLeonIndoor12;
        if (deviceModelLower.includes('-18') || deviceModelLower.includes('18w')) return assets.inventorIilpLeonIndoor18;
        if (deviceModelLower.includes('-24') || deviceModelLower.includes('24w')) return assets.inventorIilpLeonIndoor24;
        return assets.inventorIilpLeonIndoor;
      }
      if (deviceModelLower.includes('empvi-')) return assets.inventorIilpEmperorIndoor;
      if (deviceModelLower.includes('thrvi-')) return assets.inventorIilpThoraIndoor;
      return assets.inventorIilpNeoIndoor;
    }
    if (deviceModelLower.includes('ftxf') || deviceIdLower.includes('ftxf') || deviceNameLower.includes('sensira')) {
      return assets.iilpSensiraIndoor;
    }
    if (
      deviceModelLower.includes('ftxtm')
      || deviceModelLower.includes('ftxm')
      || deviceIdLower.includes('ftxtm')
      || deviceIdLower.includes('ftxm')
      || deviceNameLower.includes('perfera')
    ) {
      return assets.iilpPerferaIndoor;
    }
    if (deviceModelLower.includes('ftxj') || deviceIdLower.includes('ftxj') || deviceNameLower.includes('emura')) {
      return assets.iilpEmuraWhite;
    }
    if (deviceModelLower.includes('ftxa') || deviceIdLower.includes('ftxa') || deviceNameLower.includes('stylish')) {
      if (deviceNameLower.includes('musta') || deviceNameLower.includes('black')) return assets.iilpStylishBlack;
      if (deviceNameLower.includes('hopea') || deviceNameLower.includes('silver')) return assets.iilpStylishSilver;
      return assets.iilpStylishWhite;
    }
    if (
      deviceModelLower.includes('ftxz')
      || deviceIdLower.includes('ftxz')
      || deviceNameLower.includes('ururu')
      || deviceNameLower.includes('sarara')
    ) {
      return assets.iilpUruruSararaIndoor;
    }
    if (
      deviceModelLower.includes('ftxta')
      || deviceIdLower.includes('ftxta')
      || deviceNameLower.includes('lattia')
      || deviceNameLower.includes('floor')
    ) {
      return assets.iilpFloorConsole;
    }
    if (deviceModelLower.includes('ftxtj') || deviceIdLower.includes('ftxtj') || deviceNameLower.includes('nepura')) {
      return assets.iilpNepuraIndoor;
    }
    if (deviceModelLower.includes('ftxtp') || deviceIdLower.includes('ftxtp') || deviceNameLower.includes('comfora')) {
      return assets.iilpComforaIndoor;
    }
    return '';
  };

  let images: TermatekProductImage[] = [];

  if (quoteType === 'vesi-ilma') {
    const outdoor = pickVilpOutdoorSrc();
    const indoor = pickVilpIndoorSrc();
    if (outdoor) images.push({ label: 'Ulkoyksikkö', src: outdoor, alt: 'Ulkoyksikkö' });
    if (indoor) images.push({ label: 'Sisäyksikkö', src: indoor, alt: 'Sisäyksikkö' });
  } else if (quoteType === 'ilma-ilma') {
    const isInventorIilp =
      deviceNameLower.includes('inventor')
      || deviceModelLower.includes('ar5vi-')
      || deviceModelLower.includes('n2uvi-')
      || deviceModelLower.includes('necuvi-')
      || deviceModelLower.includes('lhuvi-')
      || deviceModelLower.includes('empvi-')
      || deviceModelLower.includes('thrvi-');
    const indoor = pickIilpIndoorSrc() || (isSensira ? assets.sensiraIndoor : '');
    const isLeon = deviceModelLower.includes('lhuvi-');
    const outdoor = indoor
      ? isInventorIilp
        ? isLeon
          ? deviceModelLower.includes('-09')
              || deviceModelLower.includes('09w')
              || deviceModelLower.includes('-12')
              || deviceModelLower.includes('12w')
            ? assets.inventorIilpLeonOutdoor09
            : deviceModelLower.includes('-18') || deviceModelLower.includes('18w')
              ? assets.inventorIilpLeonOutdoor18
              : deviceModelLower.includes('-24') || deviceModelLower.includes('24w')
                ? assets.inventorIilpLeonOutdoor24
                : assets.inventorIilpLeonOutdoor09
          : assets.inventorIilpOutdoor
        : isSensira
          ? assets.sensiraOutdoor
          : deviceModelLower.includes('ftxtp') || deviceIdLower.includes('ftxtp') || deviceNameLower.includes('comfora')
            ? assets.iilpComforaOutdoor
            : assets.iilpOutdoorGeneric
      : '';
    if (indoor) images.push({ label: 'Sisäyksikkö', src: indoor, alt: 'Sisäyksikkö' });
    if (outdoor) images.push({ label: 'Ulkoyksikkö', src: outdoor, alt: 'Ulkoyksikkö' });
  }

  return applyRegistryProductImageUrls(images, device);
}

export async function embedUrlAsDataUrl(url: string): Promise<string> {
  if (!url || url.startsWith('data:')) return url;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return url;
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || url));
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

export async function embedTermatekAssets(assets: TermatekAssetMap): Promise<TermatekAssetMap> {
  const keys = Object.keys(assets) as TermatekAssetKey[];
  const entries = await Promise.all(
    keys.map(async (key) => [key, await embedUrlAsDataUrl(assets[key])] as const),
  );
  return Object.fromEntries(entries) as TermatekAssetMap;
}

export async function embedTermatekProductImages(images: TermatekProductImage[]): Promise<TermatekProductImage[]> {
  return Promise.all(
    images.map(async (img) => ({ ...img, src: await embedUrlAsDataUrl(img.src) })),
  );
}
