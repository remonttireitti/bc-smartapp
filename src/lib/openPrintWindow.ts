import {
  applyPrintDocumentTitle,
  ensurePrintHtmlDocumentTitle,
  guardPrintTitle,
  resolvePrintDocumentTitle,
} from './printDocumentShell';

const DEFAULT_IMAGE_WAIT_MS = 10_000;
const PRINT_TITLE_SETTLE_MS = 250;

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

type PrintTarget = {
  printWindow: Window;
  printDocument: Document;
  cleanup: () => void;
};

function createPrintPopup(html: string, documentTitle: string): PrintTarget | null {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return null;

  printWindow.document.write(html);
  printWindow.document.close();
  applyPrintDocumentTitle(printWindow.document, documentTitle);

  const cleanup = () => {
    try {
      printWindow.close();
    } catch {
      /* already closed */
    }
  };
  printWindow.addEventListener('afterprint', cleanup, { once: true });
  window.setTimeout(cleanup, 60_000);

  return { printWindow, printDocument: printWindow.document, cleanup };
}

function createPrintFrame(html: string, documentTitle: string): PrintTarget {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(frame);

  const printWindow = frame.contentWindow;
  const printDocument = frame.contentDocument;
  if (!printWindow || !printDocument) {
    frame.remove();
    throw new Error('Tulostusikkunaa ei voitu avata.');
  }

  printDocument.open();
  printDocument.write(html);
  printDocument.close();
  applyPrintDocumentTitle(printDocument, documentTitle);

  const cleanup = () => {
    if (frame.parentNode) frame.parentNode.removeChild(frame);
  };
  printWindow.addEventListener('afterprint', cleanup, { once: true });
  window.setTimeout(cleanup, 60_000);

  return { printWindow, printDocument, cleanup };
}

function attachBeforePrintTitle(doc: Document, title: string): () => void {
  const handler = () => applyPrintDocumentTitle(doc, title);
  doc.addEventListener('beforeprint', handler);
  return () => doc.removeEventListener('beforeprint', handler);
}

function openPrintTarget(
  target: PrintTarget,
  documentTitle: string,
  imageWaitMs: number,
) {
  const { printWindow, printDocument } = target;
  const detachBeforePrintTarget = attachBeforePrintTitle(printDocument, documentTitle);
  const detachBeforePrintParent = attachBeforePrintTitle(document, documentTitle);

  const triggerPrint = async () => {
    applyPrintDocumentTitle(printDocument, documentTitle);
    // Chrome käyttää iframe-tulostuksessa pääikkunan title-arvoa PDF-tiedostonimeen.
    guardPrintTitle(documentTitle);
    guardPrintTitle(documentTitle, printWindow);
    await delay(PRINT_TITLE_SETTLE_MS);
    applyPrintDocumentTitle(printDocument, documentTitle);
    printWindow.focus();
    printWindow.print();
  };

  const run = async () => {
    try {
      await waitForPrintImages(printDocument, imageWaitMs);
    } finally {
      await triggerPrint();
    }
  };

  const finish = () => {
    detachBeforePrintTarget();
    detachBeforePrintParent();
  };

  if (printDocument.readyState === 'complete') {
    void run().finally(finish);
    return;
  }

  printWindow.addEventListener(
    'load',
    () => {
      void run().finally(finish);
    },
    { once: true },
  );
}

export function openPrintHtml(
  html: string,
  options?: { imageWaitMs?: number; documentTitle?: string },
) {
  const imageWaitMs = options?.imageWaitMs ?? DEFAULT_IMAGE_WAIT_MS;
  const documentTitle = resolvePrintDocumentTitle(html, options?.documentTitle);
  const preparedHtml = ensurePrintHtmlDocumentTitle(html, documentTitle);

  const popup = createPrintPopup(preparedHtml, documentTitle);
  if (popup) {
    openPrintTarget(popup, documentTitle, imageWaitMs);
    return;
  }

  try {
    const frame = createPrintFrame(preparedHtml, documentTitle);
    openPrintTarget(frame, documentTitle, imageWaitMs);
  } catch {
    window.alert('Tulostusikkunaa ei voitu avata. Salli ponnahdusikkunat tälle sivustolle.');
  }
}
