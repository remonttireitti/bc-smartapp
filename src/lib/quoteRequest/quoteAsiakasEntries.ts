import { BUILDING_TYPE_OPTIONS, QUOTE_REGION_LABELS } from './constants';
import type { QuoteDocumentTileEntry } from './quoteDocumentThemes';
import type { QuoteRequestData } from './types';

export type QuoteAsiakasTileId =
  | 'tilaaja'
  | 'omistaja'
  | 'asiakas'
  | 'laite'
  | 'yhteystiedot'
  | 'iilp-kohde'
  | 'brandi';

export type QuoteAsiakasTileEntry = QuoteDocumentTileEntry<QuoteAsiakasTileId>;

type BuildArgs = {
  form: QuoteRequestData;
  customerId: string;
  customerName?: string;
  equipmentId: string;
  equipmentLabel?: string;
  reportOwnerName: string;
  showSubscriber: boolean;
  showOwnerPicker: boolean;
  showEquipment: boolean;
};

export function buildQuoteAsiakasTiles(args: BuildArgs): QuoteAsiakasTileEntry[] {
  const {
    form,
    customerId,
    customerName,
    equipmentId,
    equipmentLabel,
    reportOwnerName,
    showSubscriber,
    showOwnerPicker,
    showEquipment,
  } = args;
  const entries: QuoteAsiakasTileEntry[] = [];

  if (showSubscriber) {
    entries.push({
      id: 'tilaaja',
      title: 'Tilaaja',
      subtitle: 'Tilaaja ja portaalinäkyvyys',
      themeKey: 'customer',
    });
  }

  if (showOwnerPicker) {
    entries.push({
      id: 'omistaja',
      title: 'Tarjouksen omistaja',
      subtitle: reportOwnerName,
      themeKey: 'customer',
    });
  }

  entries.push({
    id: 'asiakas',
    title: 'Asiakas',
    subtitle: customerName?.trim() || (customerId ? 'Asiakas valittu' : 'Valitse tai luo asiakas'),
    themeKey: 'customer',
  });

  if (showEquipment && customerId) {
    entries.push({
      id: 'laite',
      title: 'Laite rekisteristä',
      subtitle: equipmentLabel?.trim() || (equipmentId ? 'Laite valittu' : 'Valinnainen'),
      themeKey: 'device',
    });
  }

  if (customerId) {
    entries.push({
      id: 'yhteystiedot',
      title: 'Yhteystiedot',
      subtitle:
        [form.customerContactPerson, form.customerPhone, form.customerEmail]
          .map((v) => String(v ?? '').trim())
          .filter(Boolean)
          .join(' · ') || 'Täytä yhteystiedot',
      themeKey: 'customer',
    });
  }

  if (form.type === 'ilma-ilma') {
    const buildingLabel =
      BUILDING_TYPE_OPTIONS.find((opt) => opt.value === form.buildingType)?.label ?? form.buildingType;
    entries.push({
      id: 'iilp-kohde',
      title: 'Kohteen perustiedot',
      subtitle: `${buildingLabel} · ${QUOTE_REGION_LABELS[form.region]}`,
      themeKey: 'site',
    });
  }

  entries.push({
    id: 'brandi',
    title: 'Brändi tulosteessa',
    subtitle: form.brandMode === 'auto' ? 'Automaattinen' : 'Valittu brändi',
    themeKey: 'terms',
  });

  return entries;
}
