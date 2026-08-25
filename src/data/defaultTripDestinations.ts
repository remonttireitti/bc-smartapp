export type DefaultTripDestination = {
  supplier_key: string;
  name: string;
  address: string;
  sort_order: number;
};

/** Yleiset tukkuri- ja tukkumyyntipisteet (pääkaupunkiseutu + valtakunnalliset kylmäalan toimittajat). */
export const DEFAULT_TRIP_DESTINATIONS: DefaultTripDestination[] = [
  // Onninen — pääkaupunkiseutu
  { supplier_key: 'onninen', name: 'Onninen Helsinki (keskus)', address: 'Työpajankatu 12, 00580 Helsinki', sort_order: 11 },
  {
    supplier_key: 'onninen_herttoniemi',
    name: 'Onninen Herttoniemi',
    address: 'Mekaanikonkatu 31, 00880 Helsinki',
    sort_order: 12,
  },
  {
    supplier_key: 'onninen_konala',
    name: 'Onninen Konala',
    address: 'Ristipellontie 16, 00390 Helsinki',
    sort_order: 13,
  },
  {
    supplier_key: 'onninen_oulunkyla',
    name: 'Onninen Oulunkylä',
    address: 'Isonpellontie 9, 00720 Helsinki',
    sort_order: 14,
  },
  { supplier_key: 'onninen_pasila', name: 'Onninen Pasila', address: 'Veturitie 27, 00240 Helsinki', sort_order: 15 },
  {
    supplier_key: 'onninen_kivenlahti',
    name: 'Onninen Kivenlahti',
    address: 'Ruukintie 18, 02330 Espoo',
    sort_order: 16,
  },
  {
    supplier_key: 'onninen_muurala',
    name: 'Onninen Muurala',
    address: 'Teirinsyrjä 2 B, 02770 Espoo',
    sort_order: 17,
  },
  {
    supplier_key: 'onninen_olarinluoma',
    name: 'Onninen Olarinluoma',
    address: 'Luomannotko 5, 02200 Espoo',
    sort_order: 18,
  },
  { supplier_key: 'onninen_kivisto', name: 'Onninen Kivistö', address: 'Mestarintie 3, 01730 Vantaa', sort_order: 19 },
  {
    supplier_key: 'onninen_koivuhaka',
    name: 'Onninen Koivuhaka',
    address: 'Niittyvillankuja 2, 01510 Vantaa',
    sort_order: 20,
  },

  // Ahlsell — pääkaupunkiseutu
  { supplier_key: 'ahlsell_espoo', name: 'Ahlsell Espoo', address: 'Luomannotko 3, 02200 Espoo', sort_order: 21 },
  {
    supplier_key: 'ahlsell_herttoniemi',
    name: 'Ahlsell Herttoniemi',
    address: 'Laippatie 1, 00880 Helsinki',
    sort_order: 22,
  },
  {
    supplier_key: 'ahlsell_konala',
    name: 'Ahlsell Konala',
    address: 'Hankasuontie 11 B, 00390 Helsinki',
    sort_order: 23,
  },
  {
    supplier_key: 'ahlsell_kalasatama',
    name: 'Ahlsell Kalasatama',
    address: 'Lautatarhankatu 6, 00580 Helsinki',
    sort_order: 24,
  },
  {
    supplier_key: 'ahlsell_vantaa',
    name: 'Ahlsell Vantaa Koivuhaka',
    address: 'Juurakkotie 5 C, 01510 Vantaa',
    sort_order: 25,
  },

  // Sonepar — pääkaupunkiseutu
  { supplier_key: 'sonepar_espoo', name: 'Sonepar Espoo', address: 'Olarinluoma 14, 02200 Espoo', sort_order: 31 },
  { supplier_key: 'sonepar_kamppi', name: 'Sonepar Kamppi', address: 'Hietaniemenkatu 14, 00100 Helsinki', sort_order: 32 },
  { supplier_key: 'sonepar_konala', name: 'Sonepar Konala', address: 'Konalantie 47, 00390 Helsinki', sort_order: 33 },
  {
    supplier_key: 'sonepar_hermanni',
    name: 'Sonepar Hermanni',
    address: 'Työpajankatu 2, 00580 Helsinki',
    sort_order: 34,
  },
  { supplier_key: 'sonepar_tuupakka', name: 'Sonepar Tuupakka', address: 'Ritakuja 2, 01740 Vantaa', sort_order: 35 },

  // LVI-Wabek — pääkaupunkiseutu
  {
    supplier_key: 'lvi_wabek_suutarila',
    name: 'LVI-Wabek Suutarila',
    address: 'Suutarilantie 61, 00750 Helsinki',
    sort_order: 41,
  },
  {
    supplier_key: 'lvi_wabek_espoo',
    name: 'LVI-Wabek Espoo (keskusvarasto)',
    address: 'Koskelontie 22, 02920 Espoo',
    sort_order: 42,
  },

  // Chiller Oy — pääkaupunkiseudun lähin varasto
  { supplier_key: 'chiller_tuusula', name: 'Chiller Oy', address: 'Sulanpolku 9, 04300 Tuusula', sort_order: 51 },

  // Kylmäalan toimittajat (valtakunnalliset)
  {
    supplier_key: 'combicool_vantaa',
    name: 'Combi Cool Vantaa',
    address: 'Pakkalantie 19, 01510 Vantaa',
    sort_order: 110,
  },
  {
    supplier_key: 'combicool_tampere',
    name: 'Combi Cool Tampere',
    address: 'Lakalaivankatu 10 B, 33840 Tampere',
    sort_order: 115,
  },
  { supplier_key: 'darment', name: 'Darment', address: 'Ruosilantie 18, 00390 Helsinki', sort_order: 120 },
  {
    supplier_key: 'ecoscandic',
    name: 'Eco Scandic',
    address: 'Harkkoraudantie 10, 00700 Helsinki',
    sort_order: 130,
  },
  {
    supplier_key: 'entrade',
    name: 'Entrade Finland',
    address: 'Jusslansuora 16 B, 04360 Tuusula',
    sort_order: 140,
  },
];
