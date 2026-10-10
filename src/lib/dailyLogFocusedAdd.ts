/**
 * "+ Lisää työ / kulu / tarvike": jos valitulle päivälle on jo kirjaus, lisätään siihen.
 * Puhtaat apufunktiot (testattavissa ilman sivua).
 */

/** Valitun päivän olemassa oleva kirjaus (uusin), tai null → uusi kirjaus. */
export function focusedAddTargetLog<T extends { id: string; log_date: string; created_at?: string | null }>(
  logs: T[],
  date: string,
): T | null {
  return (
    [...logs]
      .filter((log) => log.log_date === date)
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0] ?? null
  );
}

/** Kohdekirjauksen rivit + dialogissa lisätyt uudet rivit (ei aiemman kohteen rivejä). */
export function mergeFocusedAddRows<T extends { key: string }>(
  targetRows: T[],
  currentRows: T[],
  previousBaseKeys: Set<string>,
): T[] {
  const targetKeys = new Set(targetRows.map((row) => row.key));
  return [
    ...targetRows,
    ...currentRows.filter((row) => !previousBaseKeys.has(row.key) && !targetKeys.has(row.key)),
  ];
}

/** TYÖ lisätään päivän kirjaukseen: uusi kuvaus liitetään olemassa olevaan (ei korvata). */
export function mergeFocusedAddWorkDone(existing: string, typed: string): string {
  const base = existing.trim();
  const add = typed.trim();
  if (!add || base.includes(add)) return base;
  return base ? `${base}\n${add}` : add;
}
