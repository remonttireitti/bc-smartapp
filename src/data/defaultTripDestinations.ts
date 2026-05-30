export type DefaultTripDestination = {
  supplier_key: string;
  name: string;
  address: string;
  sort_order: number;
};

/** Yleiset tukkuri- ja tukkumyyntipisteet (Uusimaa / valtakunnalliset pääpisteet). */
export const DEFAULT_TRIP_DESTINATIONS: DefaultTripDestination[] = [
  { supplier_key: 'onninen', name: 'Onninen', address: 'Työpajankatu 12, 00580 Helsinki', sort_order: 10 },
  { supplier_key: 'ahlsell_espoo', name: 'Ahlsell Espoo', address: 'Luomannotko 3, 02200 Espoo', sort_order: 20 },
  {
    supplier_key: 'ahlsell_herttoniemi',
    name: 'Ahlsell Herttoniemi',
    address: 'Laippatie 1, 00880 Helsinki',
    sort_order: 30,
  },
  {
    supplier_key: 'lvi_wabek_suutarila',
    name: 'LVI-Wabek Suutarila',
    address: 'Suutarilantie 61, 00750 Helsinki',
    sort_order: 40,
  },
  {
    supplier_key: 'combicool_vantaa',
    name: 'Combi Cool Vantaa',
    address: 'Pakkalantie 19, 01510 Vantaa',
    sort_order: 50,
  },
  {
    supplier_key: 'combicool_tampere',
    name: 'Combi Cool Tampere',
    address: 'Lakalaivankatu 10 B, 33840 Tampere',
    sort_order: 55,
  },
  { supplier_key: 'darment', name: 'Darment', address: 'Ruosilantie 18, 00390 Helsinki', sort_order: 60 },
  {
    supplier_key: 'ecoscandic',
    name: 'Eco Scandic',
    address: 'Harkkoraudantie 10, 00700 Helsinki',
    sort_order: 70,
  },
  {
    supplier_key: 'entrade',
    name: 'Entrade Finland',
    address: 'Jusslansuora 16 B, 04360 Tuusula',
    sort_order: 80,
  },
];
