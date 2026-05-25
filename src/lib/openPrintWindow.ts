export function openPrintHtml(html: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.alert('Selain esti tulostusikkunan. Salli ponnahdusikkunat tälle sivustolle.');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  const triggerPrint = () => {
    printWindow.focus();
    printWindow.print();
  };

  printWindow.onload = () => {
    const images = printWindow.document.images;
    if (images.length === 0) {
      triggerPrint();
      return;
    }

    let pending = images.length;
    const done = () => {
      pending -= 1;
      if (pending <= 0) triggerPrint();
    };

    for (const img of images) {
      if (img.complete) done();
      else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }
    }
  };
}
