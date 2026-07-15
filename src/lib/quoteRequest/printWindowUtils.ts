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

function waitForPrintWindowReady(printWindow: Window, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);
    const run = async () => {
      try {
        await waitForDocumentImages(printWindow.document, Math.min(timeoutMs, 8000));
      } finally {
        window.clearTimeout(timer);
        finish();
      }
    };

    if (printWindow.document.readyState === 'complete') {
      void run();
      return;
    }

    printWindow.addEventListener('load', () => void run(), { once: true });
  });
}

export async function openPrintWindow(html: string, timeoutMs = 12000): Promise<boolean> {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  await waitForPrintWindowReady(printWindow, timeoutMs);

  printWindow.focus();
  printWindow.print();
  return true;
}
