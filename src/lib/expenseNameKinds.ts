/** Kulurivin nimestä tunnistettavat lajit (tarjouksen ja työraportin rivit). */
const ACCOMMODATION_PATTERN = /majoit|hotell?i|yöpy|yöpym|asuntola|motelli|hostel/i;

export function isAccommodationName(name: string | null | undefined): boolean {
  return ACCOMMODATION_PATTERN.test(String(name ?? ''));
}
