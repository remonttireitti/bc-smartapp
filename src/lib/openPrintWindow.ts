const DEFAULT_IMAGE_WAIT_MS = 10_000;

function waitForPrintImages(doc: Document, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const pending = Array.from(doc.images).filter((img) => {
      const src = img.currentSrc || img.src;
      return !img.complete && !src.startsWith('data:');
    });

    if (pending.length === 0) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };

    let remaining = pending.length;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) finish();
    };

    const timer = window.setTimeout(finish, timeoutMs);
    for (const img of pending) {
      img.addEventListener('load', tick, { once: true });
      img.addEventListener('error', tick, { once: true });
    }
  });
}

export function openPrintHtml(
  html: string,
  options?: { imageWaitMs?: number; documentTitle?: string },
) {
  const imageWaitMs = options?.imageWaitMs ?? DEFAULT_IMAGE_WAIT_MS;
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.alert('Selain esti tulostusikkunan. Salli ponnahdusikkunat tälle sivustolle.');
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  const applyDocumentTitle = () => {
    const explicit = options?.documentTitle?.trim();
    if (explicit) {
      printWindow.document.title = explicit;
      return;
    }
    const fromHead = printWindow.document.querySelector('title')?.textContent?.trim();
    if (fromHead) {
      printWindow.document.title = fromHead;
    }
  };

  applyDocumentTitle();

  const triggerPrint = () => {
    applyDocumentTitle();
    printWindow.focus();
    printWindow.print();
  };

  const run = async () => {
    try {
      await waitForPrintImages(printWindow.document, imageWaitMs);
    } finally {
      triggerPrint();
    }
  };

  if (printWindow.document.readyState === 'complete') {
    void run();
    return;
  }

  printWindow.addEventListener('load', () => void run(), { once: true });
}
