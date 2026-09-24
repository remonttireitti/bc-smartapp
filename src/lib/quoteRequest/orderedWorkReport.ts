/** Tilauksen merkintä luo aina työraportin ja linkittää tarjouspyynnön siihen. */
export function shouldAutoCreateWorkReportOnOrder(
  _createdAt?: string | null | undefined,
): boolean {
  return true;
}
