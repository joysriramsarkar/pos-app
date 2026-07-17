"use client";

import * as React from "react";
import type { Sale, SaleItem, PrintFormat } from "@/types/pos";
import { STORE_CONFIG } from "@/types/pos";
import Decimal from 'decimal.js';
import { toMoneyNumber } from '@/lib/money';
import {
  getReceiptLanguage,
  getReceiptLabels,
  getReceiptStoreTitle,
  formatReceiptMoney,
  formatReceiptNumber,
  formatReceiptDate,
  formatReceiptTime,
  formatReceiptPaymentMethod,
  formatReceiptPaymentStatus,
} from '@/lib/receipt-i18n';

// ============================================================================
// TYPES
// ============================================================================

interface PrintInvoiceProps {
  sale: Sale;
  format: PrintFormat;
  showLogo?: boolean;
  showGst?: boolean;
  footerMessage?: string;
  className?: string;
  storeConfig?: {
    name: string;
    nameBn: string;
    address: string;
    phone: string;
    gstNumber?: string;
    logo?: string;
  };
}

// ============================================================================
// HELPER FUNCTIONS (respect Settings → receipt_language)
// ============================================================================

const formatCurrency = (amount: number | string | null | undefined): string => {
  return formatReceiptMoney(amount);
};

const formatDate = (date: Date): string => formatReceiptDate(date);
const formatTime = (date: Date): string => formatReceiptTime(date);

// ============================================================================
// THERMAL INVOICE (58mm and 80mm)
// ============================================================================

interface ThermalInvoiceProps {
  sale: Sale;
  width: "58mm" | "80mm";
  showLogo?: boolean;
  footerMessage?: string;
  storeConfig?: {
    name: string;
    nameBn: string;
    address: string;
    phone: string;
    gstNumber?: string;
    logo?: string;
  };
}

function ThermalInvoice({
  sale,
  width,
  showLogo = true,
  footerMessage,
  storeConfig,
}: ThermalInvoiceProps) {
  // Use passed config or fallback to hardcoded defaults
  const config = storeConfig || STORE_CONFIG;
  const lang = getReceiptLanguage();
  const L = getReceiptLabels(lang);
  const storeTitle = getReceiptStoreTitle(
    { name: config.name, nameBn: config.nameBn },
    lang,
  );
  const is58mm = width === "58mm";
  const fontSize = is58mm ? "text-[10px]" : "text-xs";
  const sectionPadding = is58mm ? "p-2" : "p-3";
  
  // ========================================================================
  // CRITICAL: Strict width constraints to prevent thermal printer breaks
  // ========================================================================
  const therminalWidth = is58mm ? "w-[58mm] max-w-[58mm]" : "w-[80mm] max-w-[80mm]";
  const containerStyle: React.CSSProperties = {
    width: is58mm ? "58mm" : "80mm",
    maxWidth: is58mm ? "58mm" : "80mm",
    margin: "0 auto",
    overflow: "hidden",
    wordBreak: "break-word",
    boxSizing: "border-box",
  };

  return (
    <div
      className={`thermal-invoice thermal-${width} ${therminalWidth} p-0 bg-white text-black font-mono overflow-hidden break-words`}
      style={containerStyle}
    >
      {/* Header */}
      <div className={`text-center space-y-0.5 ${sectionPadding} pb-2`}>
        {showLogo && (
          <div className="flex justify-center mb-1">
            {config.logo ? (
              <img src={config.logo} alt="logo" style={{ width: 36, height: 36, objectFit: 'contain' }} />
            ) : (
              <div style={{ width: 36, height: 36, background: '#111', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#fff', fontWeight: 900, fontSize: 14 }}>LB</span>
              </div>
            )}
          </div>
        )}
        <h1 className="font-bold text-sm tracking-wide">{storeTitle.primary}</h1>
        {storeTitle.secondary && (
          <p className={`${fontSize} font-medium`}>{storeTitle.secondary}</p>
        )}
        {config.address && <p className={`${fontSize} text-[#666]`}>{config.address}</p>}
        {config.phone && <p className={`${fontSize} text-[#666]`}>☎ {config.phone}</p>}
      </div>

      <div style={{ borderTop: '2px solid #000', margin: '0 8px' }} />
      <div style={{ borderTop: '1px solid #000', margin: '2px 8px 4px' }} />

      {/* Invoice Info */}
      <div className={`${fontSize} space-y-0.5 ${sectionPadding} py-2`}>
        <div className="flex justify-between min-w-0">
          <span className="text-[#888]">{L.invoiceNo}</span>
          <span className="font-bold shrink-0 ml-2">{sale.invoiceNumber}</span>
        </div>
        <div className="flex justify-between min-w-0">
          <span className="text-[#888]">{L.date}</span>
          <span className="shrink-0 ml-2">{formatDate(sale.createdAt)}</span>
        </div>
        <div className="flex justify-between min-w-0">
          <span className="text-[#888]">{L.time}</span>
          <span className="shrink-0 ml-2">{formatTime(sale.createdAt)}</span>
        </div>
        {sale.customer && (
          <div className="mt-1 pt-1" style={{ borderTop: '1px dashed #999' }}>
            <div className="flex justify-between min-w-0">
              <span className="text-[#888]">{L.customer}</span>
              <span className="truncate ml-2 font-medium">{sale.customer.name}</span>
            </div>
            {sale.customer.phone && (
              <div className="flex justify-between min-w-0">
                <span className="text-[#888]">{L.phone}</span>
                <span className="shrink-0 ml-2">{sale.customer.phone}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px dashed #555', margin: '0 8px 4px' }} />

      {/* Items Table */}
      <div className={`${fontSize} overflow-hidden ${sectionPadding} py-1`}>
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr style={{ borderBottom: '1px solid #000' }}>
              <th className="text-left w-[52%] font-bold pb-1">{L.item}</th>
              <th className="text-right w-[16%] font-bold pb-1">{L.qty}</th>
              <th className="text-right w-[16%] font-bold pb-1">{L.rate}</th>
              <th className="text-right w-[16%] font-bold pb-1">{L.amount}</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px dotted #ccc' }}>
                <td className="w-[52%] pr-1 align-top py-0.5 whitespace-normal">{item.productName}</td>
                <td className="w-[16%] text-right align-top py-0.5">{formatReceiptNumber(item.quantity)}{(item as any).unit || (item as any).product?.unit ? ` ${(item as any).unit || (item as any).product?.unit}` : ''}</td>
                <td className="w-[16%] text-right align-top py-0.5">{formatReceiptNumber(Number(item.unitPrice ?? 0), { maximumFractionDigits: 0 })}</td>
                <td className="w-[16%] text-right align-top py-0.5 font-medium">{formatReceiptNumber(Number(item.totalPrice ?? 0), { maximumFractionDigits: 0 })}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-1 space-y-0.5" style={{ borderTop: '1px solid #000', paddingTop: 4 }}>
          <div className="flex justify-between min-w-0">
            <span className="text-[#888]">{L.subtotal}</span>
            <span className="font-medium">{formatCurrency(sale.subtotal)}</span>
          </div>
          {(sale.discount ?? 0) > 0 && (
            <div className="flex justify-between min-w-0">
              <span className="text-[#888]">{L.discount}</span>
              <span className="font-medium">-{formatCurrency(sale.discount)}</span>
            </div>
          )}
          {(sale.tax ?? 0) > 0 && (
            <div className="flex justify-between min-w-0">
              <span className="text-[#888]">{L.tax}</span>
              <span className="font-medium">+{formatCurrency(sale.tax)}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ borderTop: '2px solid #000', margin: '2px 8px' }} />

      {/* Grand Total */}
      <div className={`${sectionPadding} py-1.5 flex justify-between font-bold text-sm`}>
        <span>{L.total.toUpperCase()}</span>
        <span>{formatCurrency(sale.totalAmount)}</span>
      </div>

      <div style={{ borderTop: '2px solid #000', margin: '2px 8px 4px' }} />

      {/* Payment Info */}
      <div className={`${fontSize} space-y-0.5 ${sectionPadding} py-1`}>
        <div className="flex justify-between min-w-0">
          <span className="text-[#888]">{L.payment}</span>
          <span className="font-semibold">{formatReceiptPaymentMethod(String(sale.paymentMethod ?? ''))}</span>
        </div>
        <div className="flex justify-between min-w-0">
          <span className="text-[#888]">{L.status}</span>
          <span className="font-semibold">{formatReceiptPaymentStatus(String(sale.paymentStatus ?? ''))}</span>
        </div>
        {toMoneyNumber(sale.amountPaid ?? 0) < toMoneyNumber(sale.totalAmount ?? 0) && (
          <div className="flex justify-between min-w-0">
            <span className="text-[#888]">{L.due}</span>
            <span className="font-bold">{formatCurrency(toMoneyNumber(new Decimal(sale.totalAmount ?? 0).minus(sale.amountPaid ?? 0)))}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px dashed #555', margin: '4px 8px 0' }} />
      <div className={`${fontSize} text-center py-3 space-y-0.5`}>
        <p className="font-bold text-sm">{L.thankYou}</p>
        {footerMessage && <p className="text-[#aaa] text-[8px] mt-1">{footerMessage}</p>}
      </div>
    </div>
  );
}

// ============================================================================
// A4/A5 INVOICE
// ============================================================================

interface StandardInvoiceProps {
  sale: Sale;
  size: "A4" | "A5";
  showLogo?: boolean;
  showGst?: boolean;
  footerMessage?: string;
  storeConfig?: {
    name: string;
    nameBn: string;
    address: string;
    phone: string;
    gstNumber?: string;
    logo?: string;
  };
}

function StandardInvoice({
  sale,
  size,
  showLogo = true,
  showGst = false,
  footerMessage,
  storeConfig,
}: StandardInvoiceProps) {
  // Use passed config or fallback to hardcoded defaults
  const config = storeConfig || STORE_CONFIG;
  const lang = getReceiptLanguage();
  const L = getReceiptLabels(lang);
  const storeTitle = getReceiptStoreTitle(
    { name: config.name, nameBn: config.nameBn },
    lang,
  );
  const isA4 = size === "A4";
  const paperWidth = isA4 ? "w-[210mm]" : "w-[148mm]";
  const paperHeight = isA4 ? "min-h-[297mm]" : "min-h-[210mm]";
  const padding = isA4 ? "p-8" : "p-6";

  return (
    <div
      className={`standard-invoice ${paperWidth} ${paperHeight} ${padding} bg-white text-black mx-auto`}
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
      {/* Header band */}
      <div style={{ background: '#111', color: '#fff', padding: '16px 24px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {showLogo && (
            config.logo ? (
              <img src={config.logo} alt="logo" style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 6, background: '#fff', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 44, height: 44, background: '#fff', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: '#111', fontWeight: 900, fontSize: 18 }}>LB</span>
              </div>
            )
          )}
          <div>
            <div style={{ fontWeight: 800, fontSize: isA4 ? 20 : 16, letterSpacing: 1 }}>{storeTitle.primary}</div>
            {storeTitle.secondary && (
              <div style={{ fontSize: isA4 ? 13 : 11, opacity: 0.8 }}>{storeTitle.secondary}</div>
            )}
            {config.address && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{config.address}</div>}
            {config.phone && <div style={{ fontSize: 11, opacity: 0.7 }}>☎ {config.phone}</div>}
            {showGst && config.gstNumber && <div style={{ fontSize: 11, opacity: 0.7 }}>GST: {config.gstNumber}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: isA4 ? 22 : 17, fontWeight: 900, letterSpacing: 2, opacity: 0.9 }}>{L.taxInvoice}</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>#{sale.invoiceNumber}</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>{formatDate(sale.createdAt)} {formatTime(sale.createdAt)}</div>
        </div>
      </div>

      {/* Bill To */}
      {sale.customer && (
        <div style={{ marginBottom: 20, padding: '10px 14px', background: '#f8f8f8', borderLeft: '4px solid #111', borderRadius: 2 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#666', marginBottom: 4 }}>{L.billTo}</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{sale.customer.name}</div>
          {sale.customer.phone && <div style={{ fontSize: 12, color: '#555' }}>☎ {sale.customer.phone}</div>}
          {sale.customer.address && <div style={{ fontSize: 12, color: '#555' }}>{sale.customer.address}</div>}
        </div>
      )}

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: isA4 ? 13 : 11 }}>
        <thead>
          <tr style={{ background: '#111', color: '#fff' }}>
            <th style={{ padding: '8px 10px', textAlign: 'left', width: '5%' }}>#</th>
            <th style={{ padding: '8px 10px', textAlign: 'left' }}>{L.item}</th>
            <th style={{ padding: '8px 10px', textAlign: 'center', width: '10%' }}>{L.qty}</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', width: '15%' }}>{L.rate}</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', width: '15%' }}>{L.amount}</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, index) => (
            <tr key={item.id} style={{ borderBottom: '1px solid #e5e5e5', background: index % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ padding: '7px 10px', color: '#888' }}>{formatReceiptNumber(index + 1)}</td>
              <td style={{ padding: '7px 10px', fontWeight: 500 }}>{item.productName}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center' }}>{formatReceiptNumber(item.quantity)}{(item as any).unit || (item as any).product?.unit ? ` ${(item as any).unit || (item as any).product?.unit}` : ''}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{formatCurrency(item.unitPrice)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.totalPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <div style={{ width: isA4 ? 240 : 200, fontSize: isA4 ? 13 : 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e5e5e5' }}>
            <span style={{ color: '#666' }}>{L.subtotal}</span>
            <span>{formatCurrency(sale.subtotal)}</span>
          </div>
          {(sale.discount ?? 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e5e5e5', color: '#16a34a' }}>
              <span>{L.discount}</span>
              <span>-{formatCurrency(sale.discount)}</span>
            </div>
          )}
          {(sale.tax ?? 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e5e5e5' }}>
              <span style={{ color: '#666' }}>{L.tax}</span>
              <span>+{formatCurrency(sale.tax)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#111', color: '#fff', fontWeight: 800, fontSize: isA4 ? 15 : 13, marginTop: 4, borderRadius: 2 }}>
            <span>{L.grandTotal}</span>
            <span>{formatCurrency(sale.totalAmount)}</span>
          </div>
          {toMoneyNumber(sale.amountPaid ?? 0) < toMoneyNumber(sale.totalAmount ?? 0) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', background: '#fee2e2', color: '#b91c1c', fontWeight: 700, fontSize: 12, marginTop: 2, borderRadius: 2 }}>
              <span>{L.due}</span>
              <span>{formatCurrency(toMoneyNumber(new Decimal(sale.totalAmount ?? 0).minus(sale.amountPaid ?? 0)))}</span>
            </div>
          )}
        </div>
      </div>

      {/* Payment + Notes row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, fontSize: isA4 ? 12 : 11, padding: '10px 14px', background: '#f8f8f8', borderRadius: 4 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>{L.paymentDetails}</div>
          <div>{L.method}: <strong>{formatReceiptPaymentMethod(String(sale.paymentMethod ?? ''))}</strong></div>
          <div>{L.status}: <strong style={{ color: sale.paymentStatus === 'Paid' ? '#16a34a' : sale.paymentStatus === 'Partial' ? '#d97706' : '#dc2626' }}>{formatReceiptPaymentStatus(String(sale.paymentStatus ?? ''))}</strong></div>
        </div>
        {sale.notes && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, marginBottom: 3 }}>{L.notes}</div>
            <div style={{ color: '#555' }}>{sale.notes}</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '2px solid #e5e5e5', paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 11, color: '#666' }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{L.terms}</div>
          <div>• {L.term1}</div>
          <div>• {L.term2}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #999', width: 120, paddingTop: 4, marginTop: 32 }}>{L.signatory}</div>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid #e5e5e5', fontSize: 12 }}>
        <strong>{L.thankYou}</strong>
        {footerMessage && <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>{footerMessage}</div>}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PrintInvoice({
  sale,
  format,
  showLogo = true,
  showGst = false,
  footerMessage = "This is a computer generated invoice.",
  className = "",
  storeConfig,
}: PrintInvoiceProps) {
  const invoiceRef = React.useRef<HTMLDivElement>(null);

  const renderInvoice = () => {
    switch (format) {
      case "thermal-58":
        return (
          <ThermalInvoice
            sale={sale}
            width="58mm"
            showLogo={showLogo}
            footerMessage={footerMessage}
            storeConfig={storeConfig}
          />
        );
      case "thermal-80":
        return (
          <ThermalInvoice
            sale={sale}
            width="80mm"
            showLogo={showLogo}
            footerMessage={footerMessage}
            storeConfig={storeConfig}
          />
        );
      case "a4":
        return (
          <StandardInvoice
            sale={sale}
            size="A4"
            showLogo={showLogo}
            showGst={showGst}
            footerMessage={footerMessage}
            storeConfig={storeConfig}
          />
        );
      case "a5":
        return (
          <StandardInvoice
            sale={sale}
            size="A5"
            showLogo={showLogo}
            showGst={showGst}
            footerMessage={footerMessage}
            storeConfig={storeConfig}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      ref={invoiceRef}
      className={`print-invoice-container ${className}`}
      data-format={format}
    >
      {renderInvoice()}
    </div>
  );
}

// ============================================================================
// PREVIEW WRAPPER
// ============================================================================

interface InvoicePreviewProps {
  sale: Sale;
  format: PrintFormat;
  showLogo?: boolean;
  showGst?: boolean;
  footerMessage?: string;
  storeConfig?: {
    name: string;
    nameBn: string;
    address: string;
    phone: string;
    gstNumber?: string;
    logo?: string;
  };
}

export function InvoicePreview({
  sale,
  format,
  showLogo = true,
  showGst = false,
  footerMessage,
  storeConfig,
}: InvoicePreviewProps) {
  const isThermal = format.startsWith("thermal");
  const previewScale = isThermal ? 1 : 0.5;

  return (
    <div className="invoice-preview w-full overflow-auto bg-gray-100 rounded-lg p-4 print:p-0 print:bg-white">
      <div
        className="origin-top-left transition-transform"
        style={{
          transform: isThermal ? "scale(1)" : `scale(${previewScale})`,
          transformOrigin: "top left",
        }}
      >
        <PrintInvoice
          sale={sale}
          format={format}
          showLogo={showLogo}
          showGst={showGst}
          footerMessage={footerMessage}
          storeConfig={storeConfig}
        />
      </div>
    </div>
  );
}

export default PrintInvoice;
