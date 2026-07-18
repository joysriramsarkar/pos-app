import { Capacitor } from '@capacitor/core';
import type { PrintFormat } from '@/types/pos';

/**
 * PrintOptions interface for configuring iframe-based printing
 */
interface PrintOptions {
  printContent: HTMLElement;
  pageStyle?: string;
  onBeforePrint?: () => void;
  onAfterPrint?: () => void;
  format?: PrintFormat;
  /** Optional document title for print job / PDF filename */
  documentName?: string;
}

const isCapacitorNative = (): boolean =>
  typeof window !== 'undefined' && !!Capacitor.isNativePlatform?.();

function getPageSizeStyle(fmt?: string): string {
  switch (fmt) {
    case 'thermal-58':
      return `
          @page { size: 58mm auto; margin: 0; padding: 0; }
          body { width: 58mm; max-width: 58mm; margin: 0; padding: 0; }
          .print-invoice-container { width: 58mm !important; max-width: 58mm !important; }
        `;
    case 'thermal-80':
      return `
          @page { size: 80mm auto; margin: 0; padding: 0; }
          body { width: 80mm; max-width: 80mm; margin: 0; padding: 0; }
          .print-invoice-container { width: 80mm !important; max-width: 80mm !important; }
        `;
    case 'a4':
      return `
          @page { size: A4 portrait; margin: 0.5cm; }
          body { width: 210mm; max-width: 210mm; margin: 0; padding: 0; }
          .print-invoice-container { width: 210mm !important; max-width: 210mm !important; }
        `;
    case 'a5':
      return `
          @page { size: A5 portrait; margin: 0.5cm; }
          body { width: 148mm; max-width: 148mm; margin: 0; padding: 0; }
          .print-invoice-container { width: 148mm !important; max-width: 148mm !important; }
        `;
    default:
      return `@page { size: auto; margin: 0; padding: 0; }`;
  }
}

function collectStyles(): { styleLinks: string[]; inlineStyles: string[] } {
  const styleLinks: string[] = [];
  const inlineStyles: string[] = [];

  Array.from(document.querySelectorAll('link[rel="stylesheet"]')).forEach((link) => {
    const href = (link as HTMLLinkElement).href;
    if (href) styleLinks.push(`<link rel="stylesheet" href="${href}">`);
  });

  Array.from(document.querySelectorAll('style')).forEach((style) => {
    if (style.textContent) inlineStyles.push(`<style>${style.textContent}</style>`);
  });

  return { styleLinks, inlineStyles };
}

function buildPrintHtml(
  printContent: HTMLElement,
  pageStyle: string | undefined,
  format: string | undefined,
): string {
  const { styleLinks, inlineStyles } = collectStyles();

  return `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice Print</title>
        ${styleLinks.join('\n        ')}
        ${inlineStyles.join('\n        ')}
        <style>
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            background: white !important;
            color: black !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }

          body > *,
          body > * * {
            visibility: visible !important;
          }

          .no-print,
          .no-print * {
            display: none !important;
            visibility: hidden !important;
          }

          @page { margin: 0; }

          .thermal-invoice *,
          .standard-invoice * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .print-invoice-container {
            display: block !important;
            position: relative !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
          }

          .thermal-invoice,
          .standard-invoice {
            background: white !important;
            color: black !important;
            font-family: 'Monaco', 'Courier', monospace !important;
            box-sizing: border-box !important;
          }

          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }

          img, svg {
            max-width: 100% !important;
            height: auto !important;
          }

          ${getPageSizeStyle(format)}
          ${pageStyle ?? ''}
        </style>
      </head>
      <body>
        ${printContent.outerHTML}
      </body>
    </html>`;
}

function cleanupIframe(iframe: HTMLIFrameElement): void {
  try {
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  } catch (e) {
    console.warn('[PrintUtil] Iframe cleanup failed:', e);
  }
}

/** Cordova printer plugin (optional — not shipped by default). */
function tryCordovaPrint(html: string, name: string): Promise<boolean> {
  const printer = (window as any).cordova?.plugins?.printer;
  if (!printer?.print) return Promise.resolve(false);

  return new Promise((resolve) => {
    try {
      printer.print(
        html,
        { name, duplex: false, landscape: false },
        (result?: boolean) => resolve(result !== false),
        () => resolve(false),
      );
    } catch {
      resolve(false);
    }
  });
}

/**
 * Trigger browser/WebView print dialog on an iframe window.
 * Android System WebView (Chromium) routes this to PrintManager.
 * Keep iframe off-screen but not display:none — some WebViews skip print for display:none frames.
 */
function tryIframePrint(iframe: HTMLIFrameElement): Promise<boolean> {
  const win = iframe.contentWindow;
  if (!win?.print) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      win.removeEventListener?.('afterprint', onAfter);
      resolve(ok);
    };

    const onAfter = () => finish(true);

    try {
      win.addEventListener?.('afterprint', onAfter);
      win.focus();
      win.print();
      // afterprint is flaky on some Android WebViews — assume success after a beat
      setTimeout(() => finish(true), 1500);
    } catch (err) {
      console.warn('[PrintUtil] iframe.print() failed:', err);
      finish(false);
    }
  });
}

/**
 * Last-resort native print: write a PDF and open the system share sheet
 * (user can pick a printer app). Prefer real print dialogs above this.
 */
async function sharePdfFallback(
  printHtml: string,
  format: PrintFormat | undefined,
  documentName: string,
): Promise<void> {
  const { generateInvoicePdf, writePdfToCacheAndShare } = await import('@/lib/invoicePdf');
  // Strip full document wrapper — generator expects invoice markup in a container
  const blob = await generateInvoicePdf(printHtml, format || 'thermal-80');
  await writePdfToCacheAndShare(blob, documentName, {
    title: documentName,
    text: documentName,
    dialogTitle: 'Print / Share Invoice',
  });
}

/**
 * Industry-standard iframe-based print utility for POS applications.
 *
 * Web: iframe + window.print()
 * Android/iOS Capacitor:
 *   1) optional cordova-plugin-printer
 *   2) WebView print() → Android PrintManager
 *   3) PDF share sheet (never HTML)
 */
export const printToIframe = (options: PrintOptions): void => {
  const {
    printContent,
    pageStyle,
    onBeforePrint,
    onAfterPrint,
    format,
    documentName = 'Invoice',
  } = options;

  if (!printContent) {
    console.error('[PrintUtil] Print content is missing.');
    return;
  }

  const isCapacitor = isCapacitorNative();
  const printHtml = buildPrintHtml(printContent, pageStyle, format);

  const iframe = document.createElement('iframe');
  // Off-screen but paintable — display:none breaks print on many Android WebViews
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0;';
  iframe.id = `print-iframe-${Date.now()}`;
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document;
  if (!iframeDoc) {
    console.error('[PrintUtil] Could not access iframe document.');
    cleanupIframe(iframe);
    return;
  }

  iframeDoc.open();
  iframeDoc.write(printHtml);
  iframeDoc.close();

  const handlePrint = async (): Promise<void> => {
    try {
      onBeforePrint?.();

      if (isCapacitor) {
        // 1) Optional cordova printer plugin
        const cordovaOk = await tryCordovaPrint(printHtml, documentName);
        if (cordovaOk) {
          onAfterPrint?.();
          cleanupIframe(iframe);
          return;
        }

        // 2) WebView / Chromium print dialog (Android PrintManager)
        const iframeOk = await tryIframePrint(iframe);
        if (iframeOk) {
          onAfterPrint?.();
          // Delay cleanup so the print service can snapshot content
          setTimeout(() => cleanupIframe(iframe), 2000);
          return;
        }

        // 3) PDF share sheet (print apps accept PDF, not HTML)
        console.warn('[PrintUtil] Native print dialog unavailable — sharing PDF');
        await sharePdfFallback(printHtml, format, documentName);
        onAfterPrint?.();
        cleanupIframe(iframe);
        return;
      }

      // Desktop / mobile browser
      const ok = await tryIframePrint(iframe);
      if (!ok) {
        console.error('[PrintUtil] Print failed');
      }
      onAfterPrint?.();
      setTimeout(() => cleanupIframe(iframe), 1000);
    } catch (error) {
      console.error('[PrintUtil] Print failed:', error);
      cleanupIframe(iframe);
    }
  };

  const loadableElements = iframe.contentWindow?.document.querySelectorAll('img');
  let loadedCount = 0;
  const totalCount = loadableElements?.length ?? 0;

  if (totalCount === 0) {
    setTimeout(handlePrint, 150);
  } else {
    loadableElements?.forEach((img: Element) => {
      const imgElement = img as HTMLImageElement;
      const incrementLoaded = (): void => {
        loadedCount++;
        if (loadedCount === totalCount) handlePrint();
      };
      if (imgElement.complete) incrementLoaded();
      else {
        imgElement.addEventListener('load', incrementLoaded, { once: true });
        imgElement.addEventListener('error', incrementLoaded, { once: true });
      }
    });
  }
};
