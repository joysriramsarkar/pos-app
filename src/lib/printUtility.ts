import { Capacitor } from '@capacitor/core';
import type { PrintFormat } from '@/types/pos';

/**
 * PrintOptions interface for configuring printing
 */
interface PrintOptions {
  printContent: HTMLElement;
  pageStyle?: string;
  onBeforePrint?: () => void;
  onAfterPrint?: () => void;
  onError?: (message: string) => void;
  format?: PrintFormat;
  /** Optional document title for print job / PDF filename */
  documentName?: string;
}

const PRINT_ROOT_ID = 'app-print-root';
const PRINT_ROOT_STYLE_ID = 'app-print-root-style';

const isCapacitorNative = (): boolean =>
  typeof window !== 'undefined' && !!Capacitor.isNativePlatform?.();

function getPageSizeStyle(fmt?: string): string {
  switch (fmt) {
    case 'thermal-58':
      return `
          @page { size: 58mm auto; margin: 0; }
          .print-invoice-container { width: 58mm !important; max-width: 58mm !important; }
        `;
    case 'thermal-80':
      return `
          @page { size: 80mm auto; margin: 0; }
          .print-invoice-container { width: 80mm !important; max-width: 80mm !important; }
        `;
    case 'a4':
      return `
          @page { size: A4 portrait; margin: 8mm; }
          .print-invoice-container { width: 100% !important; max-width: 100% !important; }
        `;
    case 'a5':
      return `
          @page { size: A5 portrait; margin: 6mm; }
          .print-invoice-container { width: 100% !important; max-width: 100% !important; }
        `;
    default:
      return `@page { size: auto; margin: 8mm; }`;
  }
}

/**
 * Page size has to be applied to the *top* document too: buildPrintHtml()'s
 * head styles are thrown away when we mount only the body markup for
 * window.print(). Without this, every invoice (A4/A5 included) inherited the
 * global 80mm receipt page size.
 */
const PRINT_PAGE_STYLE_ID = 'app-print-page-style';

function applyTopWindowPageStyle(fmt?: string): void {
  let el = document.getElementById(PRINT_PAGE_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = PRINT_PAGE_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = getPageSizeStyle(fmt);
}

function clearTopWindowPageStyle(): void {
  document.getElementById(PRINT_PAGE_STYLE_ID)?.remove();
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

// ---------------------------------------------------------------------------
// Top-window printing — the ONLY path that works on mobile browsers.
//
// Mobile Safari has no iframe.print() at all, Chrome for Android dropped
// reliable iframe printing, and Android's WebView only routes the TOP frame to
// PrintManager. So we mount the invoice into the real document behind a print
// stylesheet and call window.print() on the top window. It is a visible white
// overlay while printing so mobile engines actually rasterise it.
// ---------------------------------------------------------------------------

let printRootStyleEl: HTMLStyleElement | null = null;

function ensurePrintRootStyle(): HTMLStyleElement {
  const existing = document.getElementById(PRINT_ROOT_STYLE_ID);
  if (existing) return existing as HTMLStyleElement;

  const style = document.createElement('style');
  style.id = PRINT_ROOT_STYLE_ID;
  style.textContent = `
    #${PRINT_ROOT_ID} {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      overflow: auto !important;
      background: #fff !important;
      color: #000 !important;
      z-index: 2147483647 !important;
      -webkit-overflow-scrolling: touch !important;
    }
    @media print {
      html, body { background: #fff !important; }
      body > *:not(#${PRINT_ROOT_ID}) { display: none !important; }
      #${PRINT_ROOT_ID} {
        position: static !important;
        overflow: visible !important;
        height: auto !important;
        width: 100% !important;
      }
      .no-print, .no-print * { display: none !important; }
    }
  `;
  document.head.appendChild(style);
  printRootStyleEl = style;
  return style;
}

function mountPrintRoot(printHtml: string): HTMLElement | null {
  try {
    ensurePrintRootStyle();
    document.getElementById(PRINT_ROOT_ID)?.remove();

    // Strip the full document wrapper — we only need the invoice markup; the
    // app stylesheets are already linked in the current page.
    const bodyMatch = printHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const inner = bodyMatch ? bodyMatch[1] : printHtml;

    const root = document.createElement('div');
    root.id = PRINT_ROOT_ID;
    root.innerHTML = inner;
    document.body.appendChild(root);
    return root;
  } catch (err) {
    console.warn('[PrintUtil] Could not mount print root:', err);
    return null;
  }
}

function unmountPrintRoot(): void {
  try {
    document.getElementById(PRINT_ROOT_ID)?.remove();
  } catch {
    /* noop */
  }
}

function waitForImages(scope: ParentNode): Promise<void> {
  const images = Array.from(scope.querySelectorAll('img'));
  if (images.length === 0) return Promise.resolve();

  return Promise.all(
    images.map((img) => {
      const el = img as HTMLImageElement;
      if (el.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => resolve();
        el.addEventListener('load', done, { once: true });
        el.addEventListener('error', done, { once: true });
        setTimeout(done, 3000);
      });
    }),
  ).then(() => undefined);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(() => resolve(), 16);
    }
  });
}

/**
 * Print the top-level window. This is the primary path on every platform.
 * Resolves to true only when window.print() actually existed and ran.
 */
async function tryTopWindowPrint(
  printHtml: string,
  format?: PrintFormat,
): Promise<boolean> {
  if (typeof window === 'undefined' || typeof window.print !== 'function') return false;

  const root = mountPrintRoot(printHtml);
  if (!root) return false;

  applyTopWindowPageStyle(format);

  let settled = false;
  const cleanup = () => {
    if (settled) return;
    settled = true;
    window.removeEventListener?.('afterprint', cleanup);
    unmountPrintRoot();
    clearTopWindowPageStyle();
  };

  try {
    await waitForImages(root);
    await nextFrame();
    await nextFrame();

    window.addEventListener?.('afterprint', cleanup, { once: true });
    window.focus?.();
    window.print();

    // Some WebViews/browsers never fire afterprint — never leave the white
    // overlay stuck on screen.
    setTimeout(cleanup, 5000);
    return true;
  } catch (err) {
    console.warn('[PrintUtil] window.print() failed:', err);
    cleanup();
    return false;
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

/** Fallback: print through a hidden iframe. Kept for older desktop browsers. */
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
      setTimeout(() => finish(true), 1500);
    } catch (err) {
      console.warn('[PrintUtil] iframe.print() failed:', err);
      finish(false);
    }
  });
}

/**
 * Last resort: write a PDF and open the system share sheet (user picks a
 * printer app). Prefer real print dialogs above this.
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

async function tryIframeRoute(printHtml: string): Promise<boolean> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;opacity:0.01;pointer-events:none;border:0;';
  iframe.id = `print-iframe-${Date.now()}`;
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document;
  if (!iframeDoc) {
    cleanupIframe(iframe);
    return false;
  }

  iframeDoc.open();
  iframeDoc.write(printHtml);
  iframeDoc.close();
  await waitForImages(iframeDoc);

  const ok = await tryIframePrint(iframe);
  setTimeout(() => cleanupIframe(iframe), 2000);
  return ok;
}

/**
 * Printing entry point. Resolves to true when a print dialog was handed off.
 *
 * Order: cordova printer → top-window print (works on mobile + Android WebView)
 *        → iframe print → PDF share sheet.
 */
export async function printToIframe(options: PrintOptions): Promise<boolean> {
  const {
    printContent,
    pageStyle,
    onBeforePrint,
    onAfterPrint,
    onError,
    format,
    documentName = 'Invoice',
  } = options;

  if (!printContent) {
    console.error('[PrintUtil] Print content is missing.');
    onError?.('Print content is missing.');
    return false;
  }

  const printHtml = buildPrintHtml(printContent, pageStyle, format);

  try {
    onBeforePrint?.();

    const isNative = isCapacitorNative();

    // 1) Optional cordova printer plugin
    if (isNative) {
      const cordovaOk = await tryCordovaPrint(printHtml, documentName);
      if (cordovaOk) {
        onAfterPrint?.();
        return true;
      }
    }

    // 2) Top-window print — the reliable path everywhere
    const topOk = await tryTopWindowPrint(printHtml, format);
    if (topOk) {
      onAfterPrint?.();
      return true;
    }

    // 3) Hidden-iframe print (older desktop browsers)
    const iframeOk = await tryIframeRoute(printHtml);
    if (iframeOk) {
      onAfterPrint?.();
      return true;
    }

    // 4) PDF share sheet — always reachable, works on every phone
    if (isNative) {
      console.warn('[PrintUtil] Print dialog unavailable — sharing PDF instead');
      await sharePdfFallback(printHtml, format, documentName);
      onAfterPrint?.();
      return true;
    }

    console.error('[PrintUtil] Print failed');
    onError?.('The print dialog could not be opened.');
    onAfterPrint?.();
    return false;
  } catch (error) {
    console.error('[PrintUtil] Print failed:', error);
    onError?.(error instanceof Error ? error.message : String(error));
    onAfterPrint?.();
    return false;
  }
}