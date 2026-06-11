
import { Capacitor } from '@capacitor/core';

/**
 * PrintOptions interface for configuring iframe-based printing
 */
interface PrintOptions {
  printContent: HTMLElement;
  pageStyle?: string;
  onBeforePrint?: () => void;
  onAfterPrint?: () => void;
  format?: "thermal-58" | "thermal-80" | "a4" | "a5";
}

const isCapacitorNative = (): boolean => typeof window !== 'undefined' && Capacitor.isNativePlatform?.();

/**
 * Industry-standard iframe-based print utility for POS applications
 * 
 * This approach:
 * 1. Isolates print styling from app styles (avoids Tailwind/layout conflicts)
 * 2. Eliminates position: fixed and visibility: hidden layout collapses
 * 3. Properly handles multi-page A4 invoices with page breaks
 * 4. Ensures thermal printer width constraints are respected
 * 
 * @param options - Configuration for print behavior
 */
export const printToIframe = (options: PrintOptions): void => {
  const { printContent, pageStyle, onBeforePrint, onAfterPrint, format } = options;

  if (!printContent) {
    console.error("[PrintUtil] Print content is missing.");
    return;
  }

  // Create a hidden iframe with minimal footprint
  const isCapacitor = isCapacitorNative();

  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.style.position = "absolute";
  iframe.style.left = "-9999px";
  iframe.style.top = "-9999px";
  iframe.id = `print-iframe-${Date.now()}`;
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document;
  if (!iframeDoc) {
    console.error("[PrintUtil] Could not access iframe document.");
    document.body.removeChild(iframe);
    return;
  }
  const getPageSizeStyle = (fmt?: string): string => {
    switch (fmt) {
      case "thermal-58":
        return `
          @page { size: 58mm auto; margin: 0; padding: 0; }
          body { width: 58mm; max-width: 58mm; margin: 0; padding: 0; }
          .print-invoice-container { width: 58mm !important; max-width: 58mm !important; }
        `;
      case "thermal-80":
        return `
          @page { size: 80mm auto; margin: 0; padding: 0; }
          body { width: 80mm; max-width: 80mm; margin: 0; padding: 0; }
          .print-invoice-container { width: 80mm !important; max-width: 80mm !important; }
        `;
      case "a4":
        return `
          @page { size: A4 portrait; margin: 0.5cm; }
          body { width: 210mm; max-width: 210mm; margin: 0; padding: 0; }
          .print-invoice-container { width: 210mm !important; max-width: 210mm !important; }
        `;
      case "a5":
        return `
          @page { size: A5 portrait; margin: 0.5cm; }
          body { width: 148mm; max-width: 148mm; margin: 0; padding: 0; }
          .print-invoice-container { width: 148mm !important; max-width: 148mm !important; }
        `;
      default:
        return `@page { size: auto; margin: 0; padding: 0; }`;
    }
  };

  // ========================================================================
  // CLONE ALL STYLESHEETS FROM MAIN DOCUMENT
  // This ensures Tailwind utility classes and all app styles work in iframe
  // ========================================================================
  const styleLinks: string[] = [];
  const inlineStyles: string[] = [];

  // Collect all <link rel="stylesheet"> tags
  Array.from(document.querySelectorAll('link[rel="stylesheet"]')).forEach((link) => {
    const href = (link as HTMLLinkElement).href;
    if (href) {
      styleLinks.push(`<link rel="stylesheet" href="${href}">`);
    }
  });

  // Collect all <style> tags (including Tailwind generated styles)
  Array.from(document.querySelectorAll('style')).forEach((style) => {
    if (style.textContent) {
      inlineStyles.push(`<style>${style.textContent}</style>`);
    }
  });

  // Construct minimal, isolated HTML for the iframe
  const printHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice Print</title>
        
        <!-- CLONED STYLESHEETS: All app styles including Tailwind -->
        ${styleLinks.join('\n        ')}
        
        <!-- CLONED INLINE STYLES: Ensures Tailwind utilities work -->
        ${inlineStyles.join('\n        ')}
        
        <style>
          /* ============================================================
             STRICT BODY & HTML RESET FOR PRINTING
             Must override all inherited styles with !important
             ============================================================ */
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            background: white !important;
            color: black !important;
            width: 100% !important;
            height: 100% !important;
            overflow: visible !important;
          }

          /* Ensure iframe contents are visible during printing, overriding cloned main document print styles */
          body > *,
          body > * * {
            visibility: visible !important;
          }

          /* Explicitly support hiding elements marked as no-print */
          .no-print,
          .no-print * {
            display: none !important;
            visibility: hidden !important;
          }

          /* ============================================================
             PAGE RULES: Zero margins for clean print
             ============================================================ */
          @page {
            margin: 0;
          }

          @page thermal-58 {
            size: 58mm auto;
            margin: 0;
          }

          @page thermal-80 {
            size: 80mm auto;
            margin: 0;
          }

          @page a4-portrait {
            size: A4 portrait;
            margin: 1.5cm;
          }

          @page a5-portrait {
            size: A5 portrait;
            margin: 1.2cm;
          }

          /* ============================================================
             UNIVERSAL RESET: Normalize all elements (thermal only)
             ============================================================ */
          .thermal-invoice * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          .standard-invoice * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          /* ============================================================
             PRINT CONTAINER: Strict formatting rules
             ============================================================ */
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
            page-break-after: auto !important;
          }

          /* ============================================================
             INVOICE CONTENT: Optimize for both thermal and A4
             ============================================================ */
          .thermal-invoice,
          .standard-invoice {
            background: white !important;
            color: black !important;
            font-family: 'Monaco', 'Courier', monospace !important;
            page-break-inside: auto !important;
            page-break-after: auto !important;
            box-sizing: border-box !important;
          }

          .product-table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
          }

          .product-name-cell {
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            white-space: normal !important;
          }

          /* Prevent breaks inside critical sections */
          .thermal-invoice > div:first-child,
          .standard-invoice > div:first-child {
            page-break-inside: avoid !important;
          }

          /* Allow natural breaks for items on long A4 invoices */
          .thermal-invoice > div:nth-child(n+3),
          .standard-invoice > div:nth-child(n+3) {
            page-break-inside: auto !important;
          }

          /* ============================================================
             IMAGES & SVG: Ensure visibility in print
             ============================================================ */
          img, svg {
            max-width: 100% !important;
            height: auto !important;
            page-break-inside: avoid !important;
          }

          /* ============================================================
             SEPARATORS & DIVIDERS: Match Tailwind styling
             ============================================================ */
          hr, .separator {
            border: none !important;
            border-top: 1px solid #000 !important;
            margin: 0.5rem 0 !important;
            page-break-inside: avoid !important;
          }

          /* ============================================================
             TABLES: Fix column overflow for thermal
             ============================================================ */
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto !important;
          }

          tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }

          td, th {
            padding: 0.25rem !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            page-break-inside: avoid !important;
          }

          /* ============================================================
             USER-PROVIDED STYLES
             ============================================================ */
          ${pageStyle ?? ""}
        </style>
      </head>
      <body>
        ${printContent.outerHTML}
      </body>
    </html>
  `;

  // Write to iframe
  iframeDoc.open();
  iframeDoc.write(printHtml);
  iframeDoc.close();

  /**
   * Trigger the print dialog after content is fully loaded
   */
  const handlePrint = async (): Promise<void> => {
    if (isCapacitor) {
      try {
        onBeforePrint?.();

        const printer = (window as any).cordova?.plugins?.printer;
        if (printer) {
          printer.print(
            printHtml,
            { name: 'Invoice', duplex: false, landscape: false },
            () => {
              onAfterPrint?.();
              if (document.body.contains(iframe)) document.body.removeChild(iframe);
            }
          );
          return;
        }

        // Fallback: share HTML
        const [{ Share }, { Directory, Filesystem }] = await Promise.all([
          import('@capacitor/share'),
          import('@capacitor/filesystem'),
        ]);
        const savedFile = await Filesystem.writeFile({
          path: `Invoice-${Date.now()}.html`,
          data: printHtml,
          directory: Directory.Cache,
          encoding: 'utf8' as any,
        });
        await Share.share({
          title: 'Invoice',
          url: savedFile.uri,
          dialogTitle: 'Print / Share Invoice',
        });
        onAfterPrint?.();
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      } catch (error) {
        console.error('[PrintUtil] Capacitor print failed:', error);
      }
      return;
    }

    if (iframe.contentWindow) {
      try {
        onBeforePrint?.();
        
        // Focus the iframe window (required for some browsers)
        iframe.contentWindow.focus();
        
        // Trigger native print dialog
        iframe.contentWindow.print();
        
        // Notify caller after print completes
        onAfterPrint?.();
      } catch (error) {
        console.error("[PrintUtil] Print failed:", error);
      } finally {
        // Clean up iframe after a short delay
        // (allows print dialog to fully render before removal)
        setTimeout(() => {
          try {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          } catch (e) {
            console.warn("[PrintUtil] Iframe cleanup failed:", e);
          }
        }, 1000);
      }
    }
  };

  // Wait for all resources to load before printing
  const loadableElements = iframe.contentWindow?.document.querySelectorAll("img");
  let loadedCount = 0;
  const totalCount = loadableElements?.length ?? 0;

  if (totalCount === 0) {
    // No images to wait for, print immediately
    setTimeout(handlePrint, 100);
  } else {
    // Wait for all images to load
    loadableElements?.forEach((img: Element) => {
      const imgElement = img as HTMLImageElement;
      
      const incrementLoaded = (): void => {
        loadedCount++;
        if (loadedCount === totalCount) {
          handlePrint();
        }
      };

      if (imgElement.complete) {
        // Image already loaded (from cache)
        incrementLoaded();
      } else {
        imgElement.addEventListener("load", incrementLoaded, { once: true });
        imgElement.addEventListener("error", incrementLoaded, { once: true });
      }
    });
  }
};
