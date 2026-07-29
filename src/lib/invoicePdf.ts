import type { PrintFormat, Sale } from '@/types/pos';
import {
  getReceiptLanguage,
  getReceiptLabels,
  getReceiptStoreTitle,
  formatReceiptMoney,
  formatReceiptNumber,
  formatReceiptDateTime,
  formatReceiptPaymentMethod,
  formatReceiptPaymentStatus,
  type ReceiptLanguage,
} from '@/lib/receipt-i18n';
import { useSettingsStore } from '@/stores/settings-store';
import { toMoneyNumber } from '@/lib/money';

/** Cached jsPDF import */
let jsPdfMod: typeof import('jspdf') | null = null;
let preloadPromise: Promise<void> | null = null;

const BENGALI_FONT_STACK =
  '"Noto Sans Bengali","Nirmala UI","Vrinda","Kalpurush","Segoe UI",Arial,sans-serif';

/** Warm up jsPDF when share UI opens (no html2canvas — we draw with Canvas 2D). */
export function preloadPdfLibs(): void {
  if (preloadPromise || typeof window === 'undefined') return;
  preloadPromise = import('jspdf')
    .then((m) => {
      jsPdfMod = m;
    })
    .then(() => undefined);
}

async function getJsPDF() {
  if (jsPdfMod) return jsPdfMod.default;
  jsPdfMod = await import('jspdf');
  return jsPdfMod.default;
}

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

function formatDims(format: PrintFormat) {
  const isThermal = format.startsWith('thermal');
  const pdfWidthMm =
    format === 'thermal-58' ? 58 : format === 'thermal-80' ? 80 : format === 'a5' ? 148 : 210;
  // Page height for multi-page PDF; canvas can be taller
  const pdfHeightMm = isThermal ? 200 : format === 'a5' ? 210 : 297;
  // 2× CSS px for crisp text (~150–180 dpi equivalent)
  const cssWidth = Math.round(pdfWidthMm * 3.78);
  const dpr = 2;
  return { isThermal, pdfWidthMm, pdfHeightMm, cssWidth, dpr };
}

/** Yield to UI so share button doesn't freeze the tab */
function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export type InvoicePdfStore = {
  name: string;
  nameBn: string;
  address?: string;
  phone?: string;
  gstNumber?: string;
};

// Keep HTML builder for any external callers / debug
export function buildSelfContainedInvoiceHtml(
  sale: Sale,
  format: PrintFormat,
  store: InvoicePdfStore,
  footerMessage?: string,
  lang?: ReceiptLanguage,
): string {
  // Minimal stub — generation path uses canvas; this is only for legacy HTML APIs
  const L = getReceiptLabels(lang || getReceiptLanguage());
  return `<div class="print-invoice-container">${L.invoice} ${sale.invoiceNumber || ''}</div>`;
}

type DrawCtx = {
  ctx: CanvasRenderingContext2D;
  width: number;
  pad: number;
  y: number;
  fontSize: number;
};

function setFont(ctx: CanvasRenderingContext2D, size: number, weight: 'normal' | 'bold' = 'normal') {
  ctx.font = `${weight === 'bold' ? '700' : '400'} ${size}px ${BENGALI_FONT_STACK}`;
}

function measure(ctx: CanvasRenderingContext2D, text: string): number {
  return ctx.measureText(text).width;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (measure(ctx, test) <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      // hard-break very long tokens
      if (measure(ctx, w) > maxWidth) {
        let chunk = '';
        for (const ch of w) {
          const t = chunk + ch;
          if (measure(ctx, t) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else chunk = t;
        }
        line = chunk;
      } else {
        line = w;
      }
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function drawCentered(d: DrawCtx, text: string, size: number, bold = false) {
  setFont(d.ctx, size, bold ? 'bold' : 'normal');
  d.ctx.fillStyle = '#000';
  d.ctx.textAlign = 'center';
  d.ctx.textBaseline = 'top';
  const lines = wrapText(d.ctx, text, d.width - d.pad * 2);
  for (const line of lines) {
    d.ctx.fillText(line, d.width / 2, d.y);
    d.y += size * 1.35;
  }
  d.ctx.textAlign = 'left';
}

function drawLine(d: DrawCtx, style: 'solid' | 'dashed' = 'solid') {
  d.ctx.strokeStyle = '#000';
  d.ctx.lineWidth = style === 'solid' ? 1.5 : 1;
  if (style === 'dashed') d.ctx.setLineDash([4, 3]);
  else d.ctx.setLineDash([]);
  d.ctx.beginPath();
  d.ctx.moveTo(d.pad, d.y);
  d.ctx.lineTo(d.width - d.pad, d.y);
  d.ctx.stroke();
  d.ctx.setLineDash([]);
  d.y += 8;
}

function drawRow(
  d: DrawCtx,
  left: string,
  right: string,
  size: number,
  opts?: { bold?: boolean; color?: string; gap?: number },
) {
  const bold = opts?.bold ?? false;
  const color = opts?.color ?? '#000';
  setFont(d.ctx, size, bold ? 'bold' : 'normal');
  d.ctx.fillStyle = color;
  d.ctx.textBaseline = 'top';
  const maxLeft = d.width - d.pad * 2 - measure(d.ctx, right) - 8;
  const leftLines = wrapText(d.ctx, left, Math.max(40, maxLeft));
  const lineH = size * 1.35;
  leftLines.forEach((line, i) => {
    d.ctx.textAlign = 'left';
    d.ctx.fillText(line, d.pad, d.y + i * lineH);
  });
  d.ctx.textAlign = 'right';
  d.ctx.fillText(right, d.width - d.pad, d.y);
  d.ctx.textAlign = 'left';
  d.y += Math.max(lineH, leftLines.length * lineH) + (opts?.gap ?? 2);
}

/**
 * Draw full invoice onto an offscreen canvas using system fonts (supports Bengali).
 * Much faster and safer than html2canvas — no main-thread hang on complex DOM.
 */
function renderInvoiceToCanvas(
  sale: Sale,
  format: PrintFormat,
  store: InvoicePdfStore,
  footerMessage?: string,
  lang?: ReceiptLanguage,
): HTMLCanvasElement {
  const receiptLang = lang || getReceiptLanguage();
  const L = getReceiptLabels(receiptLang);
  const title = getReceiptStoreTitle(
    { name: store.name || 'Store', nameBn: store.nameBn || store.name || 'Store' },
    receiptLang,
  );
  const money = (n: number | null | undefined) => formatReceiptMoney(n, receiptLang);
  const num = (n: number | string | null | undefined) =>
    formatReceiptNumber(n ?? 0, undefined, receiptLang);
  const { isThermal, cssWidth, dpr } = formatDims(format);

  const pad = isThermal ? 14 : 28;
  const base = isThermal ? 11 : 13;
  const items = sale.items || [];
  const subtotal = toMoneyNumber(
    sale.subtotal ?? items.reduce((s, i) => s + toMoneyNumber(i.totalPrice), 0),
  );
  const discount = toMoneyNumber(sale.discount);
  const tax = toMoneyNumber(sale.tax);
  const total = toMoneyNumber(sale.totalAmount);
  const paid = toMoneyNumber(sale.amountPaid);
  const due = Math.max(0, total - paid);

  // Estimate height: header + meta + table rows + totals + footer
  const estH =
    pad * 2 +
    120 +
    items.length * (base * 2.2) +
    180 +
    (footerMessage ? 40 : 0);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(Math.max(estH, 400) * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cssWidth, canvas.height / dpr);

  const d: DrawCtx = { ctx, width: cssWidth, pad, y: pad, fontSize: base };

  // Header
  drawCentered(d, title.primary, isThermal ? 15 : 20, true);
  if (title.secondary) drawCentered(d, title.secondary, isThermal ? 11 : 13, false);
  if (store.address) drawCentered(d, store.address, 10, false);
  if (store.phone) drawCentered(d, `☎ ${store.phone}`, 10, false);
  if (store.gstNumber) drawCentered(d, `GST: ${store.gstNumber}`, 10, false);
  d.y += 4;
  drawLine(d, 'solid');

  // Meta
  drawRow(d, L.invoice, sale.invoiceNumber || '', base, { bold: true });
  drawRow(d, L.dateTime, formatReceiptDateTime(sale.createdAt, receiptLang), base - 1);
  if (sale.customer?.name) {
    drawRow(d, L.customer, sale.customer.name, base - 1);
  }
  d.y += 2;
  drawLine(d, 'dashed');

  // Table header
  const col = {
    idx: pad,
    name: pad + (isThermal ? 18 : 28),
    qty: cssWidth - pad - (isThermal ? 85 : 170),
    rate: cssWidth - pad - (isThermal ? 45 : 110),
    amt: cssWidth - pad,
  };
  const nameMax = col.qty - col.name - (isThermal ? 45 : 60);

  setFont(ctx, base - 1, 'bold');
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('#', col.idx, d.y);
  ctx.fillText(L.item, col.name, d.y);
  ctx.textAlign = 'right';
  ctx.fillText(L.qty, col.qty, d.y);
  ctx.fillText(L.rate, col.rate, d.y);
  ctx.fillText(L.amount, col.amt, d.y);
  ctx.textAlign = 'left';
  d.y += base * 1.4;
  drawLine(d, 'solid');

  // Items
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const qty = toMoneyNumber(item.quantity);
    const unit = (item as { unit?: string }).unit || '';
    const qtyStr = `${num(qty)}${unit ? ` ${unit}` : ''}`;
    setFont(ctx, base - 1, 'normal');
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'top';

    const nameLines = wrapText(ctx, item.productName || '', nameMax);
    const rowH = Math.max(base * 1.35, nameLines.length * base * 1.3);

    ctx.textAlign = 'left';
    ctx.fillText(num(i + 1), col.idx, d.y);
    nameLines.forEach((line, li) => {
      ctx.fillText(line, col.name, d.y + li * base * 1.3);
    });
    ctx.textAlign = 'right';
    ctx.fillText(qtyStr, col.qty, d.y);
    ctx.fillText(money(item.unitPrice), col.rate, d.y);
    setFont(ctx, base - 1, 'bold');
    ctx.fillText(money(item.totalPrice), col.amt, d.y);
    setFont(ctx, base - 1, 'normal');
    ctx.textAlign = 'left';

    d.y += rowH + 4;
    // light separator
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, d.y - 2);
    ctx.lineTo(cssWidth - pad, d.y - 2);
    ctx.stroke();
  }

  d.y += 6;
  drawLine(d, 'solid');

  // Totals
  drawRow(d, L.subtotal, money(subtotal), base - 1);
  if (discount > 0) drawRow(d, L.discount, `-${money(discount)}`, base - 1, { color: '#166534' });
  if (tax > 0) drawRow(d, L.tax, `+${money(tax)}`, base - 1);
  d.y += 2;
  drawLine(d, 'solid');
  drawRow(d, L.grandTotal, money(total), isThermal ? 13 : 15, { bold: true, gap: 4 });
  drawRow(d, L.paid, money(paid), base - 1);
  if (due > 0) drawRow(d, L.due, money(due), base - 1, { bold: true, color: '#b91c1c' });
  drawRow(
    d,
    L.payment,
    formatReceiptPaymentMethod(String(sale.paymentMethod || ''), receiptLang),
    base - 1,
    { bold: true },
  );
  drawRow(
    d,
    L.status,
    formatReceiptPaymentStatus(
      (() => {
        const status = String(sale.paymentStatus || '').toUpperCase();
        if (status === 'CANCELLED' || status === 'REFUNDED') return sale.paymentStatus || '';
        if (paid === 0) return 'Due';
        if (paid < total) return 'Partial';
        return 'Paid';
      })(),
      receiptLang
    ),
    base - 1,
    { bold: true },
  );

  d.y += 8;
  drawLine(d, 'dashed');
  drawCentered(d, L.thankYou, base, true);
  if (footerMessage) drawCentered(d, footerMessage, 10, false);

  // Crop canvas to used height (pixel space already scaled by dpr)
  const usedH = Math.ceil((d.y + pad) * dpr);
  const final = document.createElement('canvas');
  final.width = canvas.width;
  final.height = Math.max(1, Math.min(usedH, canvas.height));
  const fctx = final.getContext('2d');
  if (fctx) {
    fctx.fillStyle = '#fff';
    fctx.fillRect(0, 0, final.width, final.height);
    fctx.drawImage(
      canvas,
      0,
      0,
      canvas.width,
      final.height,
      0,
      0,
      final.width,
      final.height,
    );
  }
  return final;
}

async function canvasToPdfBlob(canvas: HTMLCanvasElement, format: PrintFormat): Promise<Blob> {
  const jsPDF = await getJsPDF();
  const { pdfWidthMm, pdfHeightMm } = formatDims(format);

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pdfWidthMm, pdfHeightMm],
    compress: true,
  });

  const margin = 2;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;

  const imgW = usableW;
  const imgH = (canvas.height * imgW) / canvas.width;

  // Prefer JPEG for smaller/faster encode
  const jpeg = canvas.toDataURL('image/jpeg', 0.88);

  if (imgH <= usableH) {
    pdf.addImage(jpeg, 'JPEG', margin, margin, imgW, imgH, undefined, 'FAST');
    return pdf.output('blob');
  }

  // Multi-page slice
  const pxPerMm = canvas.width / imgW;
  const pageHeightPx = Math.floor(usableH * pxPerMm);
  let yPx = 0;
  let page = 0;
  const slice = document.createElement('canvas');
  slice.width = canvas.width;

  while (yPx < canvas.height) {
    if (page > 0) pdf.addPage([pdfWidthMm, pdfHeightMm], 'portrait');
    const sliceH = Math.min(pageHeightPx, canvas.height - yPx);
    slice.height = sliceH;
    const sctx = slice.getContext('2d');
    if (sctx) {
      sctx.fillStyle = '#fff';
      sctx.fillRect(0, 0, slice.width, sliceH);
      sctx.drawImage(canvas, 0, yPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
    }
    pdf.addImage(
      slice.toDataURL('image/jpeg', 0.88),
      'JPEG',
      margin,
      margin,
      imgW,
      sliceH / pxPerMm,
      undefined,
      'FAST',
    );
    yPx += sliceH;
    page++;
    if (page > 40) break;
  }

  return pdf.output('blob');
}

/** Preferred path: Canvas 2D draw → PDF (fast, Bengali-safe via system fonts). */
export async function generateInvoicePdfFromSale(
  sale: Sale,
  format: PrintFormat,
  store: InvoicePdfStore,
  footerMessage?: string,
): Promise<Blob> {
  await nextFrame(); // keep UI responsive after click
  const canvas = renderInvoiceToCanvas(sale, format, store, footerMessage);
  await nextFrame();
  const blob = await canvasToPdfBlob(canvas, format);
  if (!blob || blob.size < 80) {
    throw new Error('PDF generation produced an empty file');
  }
  return blob;
}

/** Legacy HTML path — extracts text and draws with Canvas (Bengali via system fonts). */
export async function generateInvoicePdf(
  invoiceHtml: string,
  format: PrintFormat,
): Promise<Blob> {
  await nextFrame();
  const tmp = document.createElement('div');
  tmp.innerHTML = invoiceHtml;
  const text = (tmp.innerText || 'Invoice').trim();
  const { cssWidth, dpr } = formatDims(format);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const cssH = Math.min(3000, Math.max(400, lines.length * 20 + 40));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cssWidth, cssH);
  setFont(ctx, 12, 'normal');
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';
  let y = 16;
  for (const line of lines) {
    for (const l of wrapText(ctx, line, cssWidth - 32)) {
      ctx.fillText(l, 16, y);
      y += 16;
      if (y > cssH - 20) break;
    }
  }
  return canvasToPdfBlob(canvas, format);
}

export interface SharePdfOptions {
  title?: string;
  text?: string;
  dialogTitle?: string;
}

/** Phone / tablet browser (not Capacitor native, not desktop Windows/macOS). */
function isMobileWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // Coarse check: real phones/tablets; exclude Windows desktop (even with touch)
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const winDesktop = /Windows NT/i.test(ua) && !/Windows Phone/i.test(ua);
  const macDesktop = /Macintosh/i.test(ua) && !('ontouchend' in document);
  if (winDesktop || macDesktop) return false;
  return mobileUa;
}

/**
 * Deliver PDF to the user.
 *
 * - Capacitor (Android app): system share sheet with a real cache file URI.
 * - Mobile browser: Web Share API with File when available.
 * - Desktop (Windows/macOS/Linux): always **download** a real file.
 *
 * Why not Windows Share on desktop?
 * Windows Share → "Copy" does NOT put a normal Explorer file on the clipboard the way
 * File Manager copy does. Pasting that into WhatsApp Web often fails; pasting a file
 * copied from Downloads works. Downloading first matches the flow that works.
 */
export async function writePdfToCacheAndShare(
  blob: Blob,
  baseFileName: string,
  options: SharePdfOptions = {},
): Promise<'shared' | 'downloaded'> {
  if (!blob || blob.size < 80) {
    throw new Error('PDF generation produced an empty file');
  }

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

  // Android/iOS app: real file URI + share sheet (WhatsApp etc. work)
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
    await Share.share({ title, text, url: saved.uri, dialogTitle });
    return 'shared';
  }

  // Mobile browser only — not desktop Windows Share (see comment above)
  if (isMobileWeb() && typeof navigator.share === 'function') {
    const file = new File([blob], fileName, { type: 'application/pdf' });
    const shareData: ShareData = { title, text, files: [file] };
    try {
      const can =
        typeof navigator.canShare === 'function' ? navigator.canShare(shareData) : false;
      if (can) {
        await navigator.share(shareData);
        return 'shared';
      }
    } catch (err) {
      if (isAbortError(err)) return 'shared';
      console.warn('[invoicePdf] mobile share failed, downloading:', err);
    }
  }

  // Desktop (and mobile share fallback): real file in Downloads
  downloadBlob(blob, fileName);
  return 'downloaded';
}

export async function shareInvoiceAsPdf(
  invoiceHtml: string,
  format: PrintFormat,
  invoiceNumber: string,
  storeName: string,
  _fallbackText?: string,
): Promise<'shared' | 'downloaded'> {
  const blob = await generateInvoicePdf(invoiceHtml, format);
  return writePdfToCacheAndShare(blob, `Invoice-${invoiceNumber || Date.now()}`, {
    title: `Invoice ${invoiceNumber}`,
    text: `Invoice from ${storeName}`,
    dialogTitle: 'Share Invoice',
  });
}

export async function shareInvoiceFromSale(
  sale: Sale,
  format: PrintFormat,
  store: InvoicePdfStore,
  footerMessage?: string,
): Promise<'shared' | 'downloaded'> {
  const settings = useSettingsStore.getState().settings;
  const storeCfg: InvoicePdfStore = {
    name: store.name || settings.store_name || 'Store',
    nameBn: store.nameBn || settings.store_name_bn || store.name || 'Store',
    address: store.address ?? settings.store_address,
    phone: store.phone ?? settings.store_phone,
    gstNumber: store.gstNumber ?? settings.store_gst,
  };
  const footer = footerMessage ?? settings.print_footer;
  const blob = await generateInvoicePdfFromSale(sale, format, storeCfg, footer);
  return writePdfToCacheAndShare(blob, `Invoice-${sale.invoiceNumber || Date.now()}`, {
    title: `Invoice ${sale.invoiceNumber}`,
    text: `Invoice from ${storeCfg.name}`,
    dialogTitle: 'Share Invoice',
  });
}
