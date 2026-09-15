/** Maanantai 14.9.2026 — tästä päivästä eteenpäin luodut tarjouspyynnöt saavat työraportin tilauksen yhteydessä. */
export const QUOTE_AUTO_WORK_REPORT_FROM_MS = Date.parse('2026-09-14T00:00:00+03:00');

export function shouldAutoCreateWorkReportOnOrder(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) return false;
  return createdMs >= QUOTE_AUTO_WORK_REPORT_FROM_MS;
}
