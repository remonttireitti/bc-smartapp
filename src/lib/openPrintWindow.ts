import {
  applyPrintDocumentTitle,
  ensurePrintHtmlDocumentTitle,
  guardPrintTitle,
  injectPrintDocumentBootstrap,
  resolvePrintDocumentTitle,
} from './printDocumentShell';

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

type PrintTarget = {
  printWindow: Window;
  printDocument: Document;
  cleanup: () => void;
};

function createPrintPopup(html: string, documentTitle: string): PrintTarget | null {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return null;

  printWindow.document.open();
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
  window.setTimeout(cleanup, 120_000);

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
  window.setTimeout(cleanup, 120_000);

  return { printWindow, printDocument, cleanup };
}

function attachBeforePrintTitle(doc: Document, title: string): () => void {
  const handler = () => applyPrintDocumentTitle(doc, title);
  doc.addEventListener('beforeprint', handler);
  return () => doc.removeEventListener('beforeprint', handler);
}

function watchPrintBootstrap(
  target: PrintTarget,
  documentTitle: string,
  imageWaitMs: number,
) {
  const { printWindow, printDocument } = target;
  guardPrintTitle(documentTitle);
  guardPrintTitle(documentTitle, printWindow);
  const detachBeforePrintTarget = attachBeforePrintTitle(printDocument, documentTitle);
  const detachBeforePrintParent = attachBeforePrintTitle(document, documentTitle);

  const detachListeners = () => {
    detachBeforePrintTarget();
    detachBeforePrintParent();
  };

  printWindow.addEventListener('afterprint', detachListeners, { once: true });
  window.setTimeout(detachListeners, 120_000);

  const run = async () => {
    try {
      await waitForPrintImages(printDocument, imageWaitMs);
    } finally {
      applyPrintDocumentTitle(printDocument, documentTitle);
      // Tulostus käynnistyy HTML:n sisäisestä bootstrap-skriptistä (window.print dokumentin kontekstissa).
    }
  };

  if (printDocument.readyState === 'complete') {
    void run();
    return;
  }

  printWindow.addEventListener(
    'load',
    () => {
      void run();
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
  const titledHtml = ensurePrintHtmlDocumentTitle(html, documentTitle);

  const popup = createPrintPopup(
    injectPrintDocumentBootstrap(titledHtml, documentTitle, { autoPrint: true }),
    documentTitle,
  );
  if (popup) {
    watchPrintBootstrap(popup, documentTitle, imageWaitMs);
    return;
  }

  try {
    const frame = createPrintFrame(
      injectPrintDocumentBootstrap(titledHtml, documentTitle, { autoPrint: false }),
      documentTitle,
    );
    watchPrintBootstrap(frame, documentTitle, imageWaitMs);
    window.alert(
      'Tulostus avattiin sivulle. Paina vihreää Tulosta / PDF -painiketta tulosteen yläreunassa.',
    );
  } catch {
    window.alert('Tulostusikkunaa ei voitu avata. Salli ponnahdusikkunat tälle sivustolle.');
  }
}
