import type { PrintFormat } from '@/types/pos';

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string };
  return e.name === 'AbortError' || /abort|cancel/i.test(e.message || '');
}

// Simple PDF generation via jsPDF.html (works in Capacitor WebView — no iframe needed)
async function generatePdfFromHtmlString(
  invoiceHtml: string,
  format: PrintFormat,
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');

  const isThermal = format.startsWith('thermal');
  const pdfWidthMm =
    format === 'thermal-58' ? 58 : format === 'thermal-80' ? 80 : format === 'a5' ? 148 : 210;
  const pdfHeightMm = isThermal ? 400 : format === 'a5' ? 210 : 297;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: isThermal ? [pdfWidthMm, pdfHeightMm] : format === 'a5' ? 'a5' : 'a4',
  });

  const container = document.createElement('div');
  const pxWidth = isThermal ? Math.round(pdfWidthMm * 3.78) : 794;
  container.style.cssText = `position:fixed;left:-9999px;top:0;width:${pxWidth}px;background:white;color:#000;font-family:Arial,sans-serif;`;
  // Accept full HTML document or fragment
  if (invoiceHtml.includes('<html') || invoiceHtml.includes('<!DOCTYPE')) {
    const parsed = new DOMParser().parseFromString(invoiceHtml, 'text/html');
    container.innerHTML = parsed.body?.innerHTML || invoiceHtml;
  } else {
    container.innerHTML = invoiceHtml;
  }
  document.body.appendChild(container);

  await new Promise((r) => setTimeout(r, 300));

  try {
    const invoiceEl =
      container.querySelector<HTMLElement>('.print-invoice-container') ||
      container.querySelector<HTMLElement>('.thermal-invoice') ||
      container.querySelector<HTMLElement>('.standard-invoice') ||
      container;

    await new Promise<void>((resolve, reject) => {
      pdf
        .html(invoiceEl, {
          callback: () => resolve(),
          x: 0,
          y: 0,
          width: pdfWidthMm,
          windowWidth: invoiceEl.scrollWidth || pxWidth,
          autoPaging: 'text',
          margin: [2, 2, 2, 2],
        })
        .catch?.(reject);
      // jsPDF.html may not return a rejected promise on all failures — timeout safety
      setTimeout(() => resolve(), 15000);
    });

    return pdf.output('blob');
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

export async function generateInvoicePdf(
  invoiceHtml: string,
  format: PrintFormat,
): Promise<Blob> {
  return generatePdfFromHtmlString(invoiceHtml, format);
}

export interface SharePdfOptions {
  title?: string;
  text?: string;
  dialogTitle?: string;
}

/**
 * Write a PDF blob to Capacitor cache and open the system share sheet.
 */
export async function writePdfToCacheAndShare(
  blob: Blob,
  baseFileName: string,
  options: SharePdfOptions = {},
): Promise<'shared' | 'downloaded'> {
  const fileName = baseFileName.endsWith('.pdf') ? baseFileName : `${baseFileName}.pdf`;
  const title = options.title || fileName;
  const text = options.text || title;
  const dialogTitle = options.dialogTitle || 'Share Invoice';

  let isNative = false;
  try {
    const { Capacitor } = await import('@capacitor/core');
    isNative = Capacitor.isNativePlatform();
  } catch {
    /* web */
  }

  if (isNative) {
    const [{ Share }, { Directory, Filesystem }] = await Promise.all([
      import('@capacitor/share'),
      import('@capacitor/filesystem'),
    ]);

    const base64 = await blobToBase64(blob);
    const path = fileName.replace(/[^\w.\-]+/g, '_');
    const saved = await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
    });

    await Share.share({
      title,
      text,
      url: saved.uri,
      dialogTitle,
    });
    return 'shared';
  }

  // Web: prefer native share with File; fall back to download
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const file = new File([blob], fileName, { type: 'application/pdf' });
    const shareData: ShareData = { title, text, files: [file] };

    try {
      const can =
        typeof navigator.canShare === 'function' ? navigator.canShare(shareData) : true;
      if (can) {
        await navigator.share(shareData);
        return 'shared';
      }
    } catch (err) {
      if (isAbortError(err)) {
        // User cancelled share sheet — not an error
        return 'shared';
      }
      console.warn('[invoicePdf] navigator.share failed:', err);
    }

    // Some desktops support share without files
    try {
      await navigator.share({ title, text });
      // Still download so they get the file
      downloadBlob(blob, fileName);
      return 'downloaded';
    } catch (err) {
      if (isAbortError(err)) return 'shared';
      console.warn('[invoicePdf] text share failed:', err);
    }
  }

  downloadBlob(blob, fileName);
  return 'downloaded';
}

/**
 * Generate an invoice PDF and share it (or download on desktop).
 * Never shares HTML. Never opens the print dialog (use printToIframe for that).
 */
export async function shareInvoiceAsPdf(
  invoiceHtml: string,
  format: PrintFormat,
  invoiceNumber: string,
  storeName: string,
  _fallbackText?: string,
): Promise<'shared' | 'downloaded'> {
  const fileName = `Invoice-${invoiceNumber || Date.now()}`;
  const blob = await generatePdfFromHtmlString(invoiceHtml, format);

  return writePdfToCacheAndShare(blob, fileName, {
    title: `Invoice ${invoiceNumber}`,
    text: `Invoice from ${storeName}`,
    dialogTitle: 'Share Invoice',
  });
}
