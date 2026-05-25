/** Brändin toimitus € / yksikkö (alv 0) laitetyypin mukaan (katalogin category). */
export type BrandDeliveryFeesByCategoryRow = Partial<
  Record<'ilmalampopumppu' | 'vesi-ilmalampopumppu', number>
>;

/** Yrityskohtaiset brändikohtaiset listahintakorotukset (%, tukkurin ilmoitus). */
export interface DeviceRegistryBrandSettings {
  brandPriceBumps: Record<string, number>;
  /**
   * Toimitusmaksu € / yksikkö (alv 0): brändi (avain lowercase) × laitetyyppi.
   * Ilmalämpöpumppu vs. vesi-ilmalämpöpumppu erikseen. Inventor: kerrotaan postitusyksiköillä.
   * Ei oletusta — tyhjä = 0 €.
   */
  brandDeliveryFeesByCategory?: Record<string, BrandDeliveryFeesByCategoryRow>;
  /**
   * Vanha yksi luku / brändi (täytettiin molemmille tyypeille). Luetaan vain jos uutta ei ole annettu.
   */
  brandDeliveryFeePerUnit?: Record<string, number>;
}

/** Yksittäisen mallin yliajot rekisterissä (Firestore: companies/{id}/deviceRegistryOverrides/{deviceId}). */
export interface DeviceRegistryOverride {
  deviceId: string;
  /** Absoluuttinen listahinta (alv 0). Korvaa lasketun listan (katalogi + tukkurikorotus). */
  listPriceOverride?: number | null;
  /** Yliajaa brändin oletusalennuksen listasta hankintaan (%). */
  discountFromListPercentOverride?: number | null;
  vilpOutdoorSupplyPhases?: 1 | 3 | null;
  /** IILP: yliajaa katalogin iilpProductMode */
  iilpProductModeOverride?: 'cooling_only' | 'cooling_and_heating' | null;
  /** Valitut tulosteominaisuudet (deviceFeatureOptions -id:t) */
  selectedFeatureIds?: string[];
  imageUrlIndoor?: string | null;
  imageUrlOutdoor?: string | null;
  /** Vanha yksi URL — siirretään tarvittaessa sisäkuvaan */
  imageUrl?: string | null;
  notes?: string | null;
  extraPrintFeatures?: string;
}
