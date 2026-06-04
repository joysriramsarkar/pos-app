import type { PrintFormat } from '@/types/pos';

// Simple text-based PDF generation for Capacitor (no iframe/DOM rendering needed)
async function generatePdfFromHtmlString(
  invoiceHtml: string,
  format: PrintFormat
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');

  const isThermal = format.startsWith('thermal');
  const pdfWidthMm = format === 'thermal-58' ? 58 : format === 'thermal-80' ? 80 : format === 'a5' ? 148 : 210;
  const pdfHeightMm = isThermal ? 400 : (format === 'a5' ? 210 : 297);

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: isThermal ? [pdfWidthMm, pdfHeightMm] : (format === 'a5' ? 'a5' : 'a4'),
  });

  // Create a temporary div in the main document (not iframe) for Capacitor compatibility
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:' + (isThermal ? pdfWidthMm * 3.78 : 794) + 'px;background:white;';
  container.innerHTML = invoiceHtml;
  document.body.appendChild(container);

  // Wait for fonts/layout
  await new Promise(r => setTimeout(r, 400));

  try {
    const invoiceEl = container.querySelector<HTMLElement>('.print-invoice-container') || container;

    await new Promise<void>((resolve) => {
      pdf.html(invoiceEl, {
        callback: () => resolve(),
        x: 0,
        y: 0,
        width: pdfWidthMm,
        windowWidth: invoiceEl.scrollWidth || (isThermal ? pdfWidthMm * 3.78 : 794),
        autoPaging: 'text',
        margin: [0, 0, 0, 0],
      });
    });

    return pdf.output('blob');
  } finally {
    document.body.removeChild(container);
  }
}

export async function generateInvoicePdf(
  invoiceHtml: string,
  format: PrintFormat
): Promise<Blob> {
  return generatePdfFromHtmlString(invoiceHtml, format);
}

export async function shareInvoiceAsPdf(
  invoiceHtml: string,
  format: PrintFormat,
  invoiceNumber: string,
  storeName: string,
  fallbackText: string
): Promise<void> {
  const fileName = `Invoice-${invoiceNumber}`;

  let isNativePlatform = false;
  try {
    const { Capacitor } = await import('@capacitor/core');
    isNativePlatform = Capacitor.isNativePlatform();
  } catch { /* not a native platform */ }

  if (isNativePlatform) {
    // Use cordova-plugin-printer for native print/PDF on Android
    const printer = (window as any).cordova?.plugins?.printer;
    if (printer) {
      await new Promise<void>((resolve, reject) => {
        printer.print(
          invoiceHtml,
          {
            name: `Invoice-${invoiceNumber}`,
            duplex: false,
            landscape: false,
          },
          (result: boolean) => {
            if (result) resolve();
            else reject(new Error('Print cancelled or failed'));
          }
        );
      });
      return;
    }

    // Fallback: share HTML file
    const [{ Share }, { Directory, Filesystem }] = await Promise.all([
      import('@capacitor/share'),
      import('@capacitor/filesystem'),
    ]);
    const savedFile = await Filesystem.writeFile({
      path: `Invoice-${invoiceNumber}.html`,
      data: invoiceHtml,
      directory: Directory.Cache,
      encoding: 'utf8' as any,
    });
    await Share.share({
      title: `Invoice ${invoiceNumber}`,
      text: `Invoice from ${storeName}`,
      url: savedFile.uri,
      dialogTitle: 'Share Invoice',
    });
    return;
  }

  // Web: generate PDF then share/download
  const blob = await generatePdfFromHtmlString(invoiceHtml, format);
  const pdfFileName = `${fileName}.pdf`;

  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    const file = new File([blob], pdfFileName, { type: 'application/pdf' });
    const shareData: any = { title: `Invoice ${invoiceNumber}`, text: `Invoice from ${storeName}`, files: [file] };
    try {
      // If canShare exists, prefer it; otherwise attempt share and catch failures
      const canShareResult = typeof (navigator as any).canShare === 'function' ? (navigator as any).canShare(shareData) : true;
      if (canShareResult) {
        await (navigator as any).share(shareData);
        return;
      }
    } catch (err: any) {
      // Commonly fails when not triggered by a user gesture (NotAllowedError)
      console.warn('navigator.share failed or was not allowed:', err);
      // fall through to download fallback below
    }
  }

  // Desktop fallback: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pdfFileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
