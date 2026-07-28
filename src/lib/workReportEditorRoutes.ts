/** Työraportin luonti/muokkaus — ei pidetä KeepAlive-välimuistissa (autosave + navigointi). */
export function isWorkReportEditorPath(pathname: string): boolean {
  if (pathname === '/tyoraportit/uusi') return true;
  if (pathname === '/tyoraportit/toimeksianto/uusi') return true;
  if (/^\/tyoraportit\/[^/]+\/muokkaa$/.test(pathname)) return true;
  if (/^\/tyoraportit\/toimeksianto\/[^/]+\/muokkaa$/.test(pathname)) return true;
  return false;
}

/** Vain aktiivisella reitillä oleva editori saa tallentaa / navigoida. */
export function isActiveWorkReportEditorPath(
  pathname: string,
  reportId: string | null | undefined,
  editId?: string | null,
): boolean {
  if (pathname === '/tyoraportit/uusi') return !editId;
  const id = editId ?? reportId;
  if (!id) return false;
  return pathname === `/tyoraportit/${id}/muokkaa`;
}
