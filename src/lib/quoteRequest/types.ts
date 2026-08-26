export type QuoteRequestStatus = 'draft' | 'sent';

export type QuoteType = 'vesi-ilma' | 'ilma-ilma' | 'huolto';

/** Yritys ALV 0 % tai yksityishenkilö ALV 25,5 %. */
export type QuoteVatProfile = 'business' | 'consumer';
export type QuoteRegion = 'pohjois' | 'keski' | 'etela';
export type QuoteProjectType = 'uudis' | 'korjaus' | 'rinnalle';
export type QuoteBrandMode = 'auto' | 'own' | `partner:${string}`;
export type QuoteConsumptionUnit = 'litraa' | 'kwh';
export type IilpPurpose = 'cooling' | 'cooling_heating';
/** IILP asennustyön hinnoittelutapa: urakkahinta tai tuntityö. */
export type IilpLaborPricingMode = 'urakka' | 'tuntityo';
export type VilpIndoorConfig = 'hydrobox' | 'integroitu' | 'ilman-varaa';
export type VilpBrandChoice = '' | 'Daikin' | 'Inventor' | 'Samsung';

export type QuoteWorkItem = {
  id: string;
  description: string;
  hours: number;
  pricePerHour: number;
  /** Valinnainen linkitys asiakkaan laiterekisteriin (kylmälaitehuolto). */
  equipmentId?: string;
  /** Tulostetta varten tallennettu laitteen nimi. */
  equipmentName?: string;
  /** Työkohtaiset tarvikkeet (kylmälaitehuolto). */
  materials: QuoteMaterial[];
};

export type QuoteMaterial = {
  id: string;
  name: string;
  quantity: number;
  purchasePrice: number;
  marginPercent: number;
  sellPrice: number;
};

/** Legacy simple line kept for older saved quotes. */
export type QuoteLine = {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
  unit: string;
  equipmentId?: string;
  equipmentName?: string;
};

/** Valinnainen lisä (ei sisälly tarjouksen kokonaishintaan). */
export type QuoteOptionalItem = {
  id: string;
  description: string;
  priceGross: number;
  enabled: boolean;
};

export type QuoteRequestData = {
  type: QuoteType;
  /** Yritys (alv 0) tai yksityishenkilö (alv 25,5). */
  quoteVatProfile: QuoteVatProfile;
  introText: string;
  notes: string;
  validUntil: string;
  brandMode: QuoteBrandMode;
  paymentTermsText: string;
  deliveryTermsText: string;
  customerPhone: string;
  customerEmail: string;
  customerContactPerson: string;
  buildingType: string;
  heatedArea: number;
  /** Ilmalämpöpumpun huonekorkeus (m), vaikuttaa mitoitukseen. */
  roomHeight: number;
  buildingYear: number;
  region: QuoteRegion;
  projectType: QuoteProjectType;
  heatingSystemType: string;
  heatingSystemTemp: number;
  domesticHotWater: boolean;
  householdSize: number;
  desiredTemperature: number;
  currentHeating: string;
  previousConsumption: number;
  previousConsumptionUnit: QuoteConsumptionUnit;
  deviceBrand: string;
  deviceModel: string;
  faultDescription: string;
  situationReportEnabled: boolean;
  situationReportTitle: string;
  situationReportText: string;
  workItems: QuoteWorkItem[];
  materials: QuoteMaterial[];
  /** Sisäinen asennustarvikke-laskuri; tulostuu asiakkaalle yhtenä rivinä. */
  installationSupplies: QuoteMaterial[];
  /** Asennustarvikke-laskurin työtunnit (sisäinen hankintalaskenta). */
  installationLaborHours: number;
  /** Asentajan työn hankintahinta €/h (alv 0). */
  installationLaborPurchaseRate: number;
  /** Huoltoautokorvaus € per jakso (alv 0). */
  installationVehicleAllowance: number;
  /** Tuntimäärä per huoltoautokorvausjakso. */
  installationVehicleHoursPerBlock: number;
  laborHours: number;
  laborRate: number;
  travelCost: number;
  /** Laskutetaanko km-korvaus (oletus: ei). */
  travelKmEnabled: boolean;
  travelKmDistance: number;
  /** €/km, alv 0. */
  travelKmRate: number;
  /** Termatek / tulosteen takuu- ja asennusehdot (plain text). */
  quoteTermsText: string;
  /** Mitkä ehto-osiot tulostetaan tarjouksen ehtosivulle. */
  quoteTermsPrint: QuoteTermsPrintFlags;
  vatRate: number;
  deviceDiscountPercent: number;
  deviceMarginPercent: number;
  devicePurchaseOverrideNet: number | null;
  deviceSaleOverrideNet: number | null;
  /** Tyhjä = rekisterin toimituskulu. */
  deviceDeliveryFeeNet: number | null;
  selectedDeviceId: string;
  altDevice1Id: string;
  altDevice2Id: string;
  altDevice1DiscountPercent: number;
  altDevice1MarginPercent: number;
  altDevice1DeliveryFeeNet: number | null;
  altDevice2DiscountPercent: number;
  altDevice2MarginPercent: number;
  altDevice2DeliveryFeeNet: number | null;
  optionAGood: string;
  optionABad: string;
  optionBGood: string;
  optionBBad: string;
  optionCGood: string;
  optionCBad: string;
  oilBoilerRemoval: boolean;
  oilTankEmptying: boolean;
  overallDiscountPercent: number;
  vilpBrandChoice: VilpBrandChoice | string;
  vilpOutdoorModel: string;
  vilpIndoorModel: string;
  vilpIndoorConfig: VilpIndoorConfig;
  vilpSeries: string;
  vilpTankLiters: 0 | 180 | 230;
  vilpZones: 1 | 2;
  vilpCooling: boolean;
  iilpPurpose: IilpPurpose;
  /** Oletus: urakkahinta. Vaihtoehto: tuntityö (Työt-välilehti). */
  iilpLaborPricingMode: IilpLaborPricingMode;
  /** @deprecated käytä iilpLaborPricingMode */
  iilpBaseInstallEnabled?: boolean;
  /** Urakkahinta (€, sis. ALV) kun iilpLaborPricingMode === 'urakka'. */
  iilpBaseInstallLaborGross: number;
  /** Asennustarvikkeet erikseen (€, sis. ALV). */
  iilpBaseInstallMaterialsGross: number;
  /** Huomautus kun laite valitaan käsin ehdotetun sijaan. */
  iilpDeviceSelectionNote: string;
  /** Valinnaiset lisät (eivät kokonaishinnassa). */
  optionalItems: QuoteOptionalItem[];
  /** IILP: sisäyksikön sijainti (tuloste). */
  iilpIndoorPlacement: string;
  /** IILP: ulkoyksikön sijainti (tuloste). */
  iilpOutdoorPlacement: string;
  /** IILP: putkituksen pituus (m), tuloste. */
  iilpPipeLengthM: number;
  /** IILP: sähkösyöttö / liitäntä (tuloste). */
  iilpElectricalNotes: string;
  /** IILP: kondenssiveden johto (tuloste). */
  iilpCondensateNotes: string;
  /** Arvioitu sähkönsäästö -teksti tulosteelle (tyhjä = oletusteksti). */
  iilpEnergySavingsText: string;
  /** Kohde-kentät, jotka käyttäjä on hyväksynyt oletusarvoina (avaimet). */
  acceptedSiteDefaults?: string[];
  /** @deprecated käytä acceptedSiteDefaults */
  siteConfigConfirmed?: boolean;
  /** Preserved from Firestore import when customer FK was missing. */
  legacyCustomerName?: string;
  /** @deprecated use workItems/materials */
  lines?: QuoteLine[];
};

export type QuoteRequestRow = {
  id: string;
  title: string;
  status: QuoteRequestStatus;
  data: QuoteRequestData;
  owner_company_id: string;
  created_by_company_id: string;
  branding_company_id: string;
  partnership_id: string | null;
  customer_id: string | null;
  equipment_id: string | null;
  created_at: string;
  updated_at: string;
  customers: { name: string; address: string | null; city: string | null; phone?: string | null; email?: string | null } | null;
  equipment: { name: string; tag: string | null; model?: string | null } | null;
  owner_company: { name: string } | null;
  branding_company: { name: string } | null;
  created_by_company: { name: string } | null;
};

export type QuoteEditSection = 'asiakas' | 'kohde' | 'tyot' | 'hinnoittelu';

/** Ehtosivun tulostusvalinnat (on/off). */
export type QuoteTermsPrintFlags = {
  baseInstall: boolean;
  warranty: boolean;
  commissioning: boolean;
  operationMaintenance: boolean;
  extraWork: boolean;
  general: boolean;
};
