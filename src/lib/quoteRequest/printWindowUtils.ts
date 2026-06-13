/** Odota iframe/print-ikkunan kuvat ennen tulostusta. */
export function waitForDocumentImages(doc: Document, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    const imgs = Array.from(doc.images);
    if (imgs.length === 0) {
      resolve();
      return;
    }
    let waiting = imgs.filter((img) => !img.complete).length;
    if (waiting === 0) {
      resolve();
      return;
    }
    const tick = () => {
      waiting -= 1;
      if (waiting <= 0) resolve();
    };
    for (const img of imgs) {
      if (img.complete) continue;
      img.addEventListener('load', tick, { once: true });
      img.addEventListener('error', tick, { once: true });
    }
    window.setTimeout(resolve, timeoutMs);
  });
}

export async function openPrintWindow(html: string): Promise<boolean> {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;
  printWindow.document.write(html);
  printWindow.document.close();
  await waitForDocumentImages(printWindow.document);
  printWindow.focus();
  printWindow.print();
  return true;
}
