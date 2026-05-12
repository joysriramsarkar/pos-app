"use client";

import * as React from "react";
import type { Sale, SaleItem, PrintFormat } from "@/types/pos";
import { STORE_CONFIG } from "@/types/pos";
import Decimal from 'decimal.js';
import { toMoneyNumber } from '@/lib/money';

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
// HELPER FUNCTIONS
// ============================================================================

const formatCurrency = (amount: number | null | undefined): string => {
  return `₹${(amount ?? 0).toFixed(2)}`;
};

const formatDate = (date: Date): string => {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatTime = (date: Date): string => {
  return new Date(date).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

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
      className={`thermal-invoice thermal-${width} ${therminalWidth} p-0 bg-white text-black font-mono overflow-hidden wrap-break-word`}
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
        <h1 className="font-bold text-sm tracking-wide uppercase">{config.name}</h1>
        <p className={`${fontSize} font-medium`}>{config.nameBn}</p>
        {config.address && <p className={`${fontSize} text-gray-600`}>{config.address}</p>}
        {config.phone && <p className={`${fontSize} text-gray-600`}>☎ {config.phone}</p>}
      </div>

      <div style={{ borderTop: '2px solid #000', margin: '0 8px' }} />
      <div style={{ borderTop: '1px solid #000', margin: '2px 8px 4px' }} />

      {/* Invoice Info */}
      <div className={`${fontSize} space-y-0.5 ${sectionPadding} py-2`}>
        <div className="flex justify-between min-w-0">
          <span className="text-gray-500">Invoice#</span>
          <span className="font-bold shrink-0 ml-2">{sale.invoiceNumber}</span>
        </div>
        <div className="flex justify-between min-w-0">
          <span className="text-gray-500">Date</span>
          <span className="shrink-0 ml-2">{formatDate(sale.createdAt)}</span>
        </div>
        <div className="flex justify-between min-w-0">
          <span className="text-gray-500">Time</span>
          <span className="shrink-0 ml-2">{formatTime(sale.createdAt)}</span>
        </div>
        {sale.customer && (
          <div className="mt-1 pt-1" style={{ borderTop: '1px dashed #999' }}>
            <div className="flex justify-between min-w-0">
              <span className="text-gray-500">Customer</span>
              <span className="truncate ml-2 font-medium">{sale.customer.name}</span>
            </div>
            {sale.customer.phone && (
              <div className="flex justify-between min-w-0">
                <span className="text-gray-500">Phone</span>
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
              <th className="text-left w-[52%] font-bold pb-1">Item</th>
              <th className="text-right w-[16%] font-bold pb-1">Qty</th>
              <th className="text-right w-[16%] font-bold pb-1">Rate</th>
              <th className="text-right w-[16%] font-bold pb-1">Amt</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px dotted #ccc' }}>
                <td className="w-[52%] pr-1 align-top py-0.5 whitespace-normal">{item.productName}</td>
                <td className="w-[16%] text-right align-top py-0.5">{item.quantity}{(item as any).unit ? ` ${(item as any).unit}` : ''}</td>
                <td className="w-[16%] text-right align-top py-0.5">{(item.unitPrice ?? 0).toFixed(0)}</td>
                <td className="w-[16%] text-right align-top py-0.5 font-medium">{(item.totalPrice ?? 0).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-1 space-y-0.5" style={{ borderTop: '1px solid #000', paddingTop: 4 }}>
          <div className="flex justify-between min-w-0">
            <span className="text-gray-500">Subtotal</span>
            <span className="font-medium">{formatCurrency(sale.subtotal)}</span>
          </div>
          {(sale.discount ?? 0) > 0 && (
            <div className="flex justify-between min-w-0">
              <span className="text-gray-500">Discount</span>
              <span className="font-medium">-{formatCurrency(sale.discount)}</span>
            </div>
          )}
          {(sale.tax ?? 0) > 0 && (
            <div className="flex justify-between min-w-0">
              <span className="text-gray-500">Tax</span>
              <span className="font-medium">+{formatCurrency(sale.tax)}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ borderTop: '2px solid #000', margin: '2px 8px' }} />

      {/* Grand Total */}
      <div className={`${sectionPadding} py-1.5 flex justify-between font-bold text-sm`}>
        <span>TOTAL</span>
        <span>{formatCurrency(sale.totalAmount)}</span>
      </div>

      <div style={{ borderTop: '2px solid #000', margin: '2px 8px 4px' }} />

      {/* Payment Info */}
      <div className={`${fontSize} space-y-0.5 ${sectionPadding} py-1`}>
        <div className="flex justify-between min-w-0">
          <span className="text-gray-500">Payment</span>
          <span className="font-semibold">{sale.paymentMethod}</span>
        </div>
        <div className="flex justify-between min-w-0">
          <span className="text-gray-500">Status</span>
          <span className="font-semibold">{sale.paymentStatus}</span>
        </div>
        {toMoneyNumber(sale.amountPaid ?? 0) < toMoneyNumber(sale.totalAmount ?? 0) && (
          <div className="flex justify-between min-w-0">
            <span className="text-gray-500">Due</span>
            <span className="font-bold">{formatCurrency(toMoneyNumber(new Decimal(sale.totalAmount ?? 0).minus(sale.amountPaid ?? 0)))}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px dashed #555', margin: '4px 8px 0' }} />
      <div className={`${fontSize} text-center py-3 space-y-0.5`}>
        <p className="font-bold text-sm">ধন্যবাদ!</p>
        <p className="text-gray-600">Thank you for shopping!</p>
        {footerMessage && <p className="text-gray-400 text-[8px] mt-1">{footerMessage}</p>}
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
            <div style={{ fontWeight: 800, fontSize: isA4 ? 20 : 16, letterSpacing: 1 }}>{config.name}</div>
            <div style={{ fontSize: isA4 ? 13 : 11, opacity: 0.8 }}>{config.nameBn}</div>
            {config.address && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{config.address}</div>}
            {config.phone && <div style={{ fontSize: 11, opacity: 0.7 }}>☎ {config.phone}</div>}
            {showGst && config.gstNumber && <div style={{ fontSize: 11, opacity: 0.7 }}>GST: {config.gstNumber}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: isA4 ? 22 : 17, fontWeight: 900, letterSpacing: 2, opacity: 0.9 }}>INVOICE</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>#{sale.invoiceNumber}</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>{formatDate(sale.createdAt)} {formatTime(sale.createdAt)}</div>
        </div>
      </div>

      {/* Bill To */}
      {sale.customer && (
        <div style={{ marginBottom: 20, padding: '10px 14px', background: '#f8f8f8', borderLeft: '4px solid #111', borderRadius: 2 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#666', marginBottom: 4 }}>Bill To</div>
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
            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Item</th>
            <th style={{ padding: '8px 10px', textAlign: 'center', width: '10%' }}>Qty</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', width: '15%' }}>Rate</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', width: '15%' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, index) => (
            <tr key={item.id} style={{ borderBottom: '1px solid #e5e5e5', background: index % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ padding: '7px 10px', color: '#888' }}>{index + 1}</td>
              <td style={{ padding: '7px 10px', fontWeight: 500 }}>{item.productName}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center' }}>{item.quantity}{(item as any).unit ? ` ${(item as any).unit}` : ''}</td>
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
            <span style={{ color: '#666' }}>Subtotal</span>
            <span>{formatCurrency(sale.subtotal)}</span>
          </div>
          {(sale.discount ?? 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e5e5e5', color: '#16a34a' }}>
              <span>Discount</span>
              <span>-{formatCurrency(sale.discount)}</span>
            </div>
          )}
          {(sale.tax ?? 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e5e5e5' }}>
              <span style={{ color: '#666' }}>Tax</span>
              <span>+{formatCurrency(sale.tax)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#111', color: '#fff', fontWeight: 800, fontSize: isA4 ? 15 : 13, marginTop: 4, borderRadius: 2 }}>
            <span>Grand Total</span>
            <span>{formatCurrency(sale.totalAmount)}</span>
          </div>
          {(sale.amountPaid ?? 0) < (sale.totalAmount ?? 0) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', background: '#fee2e2', color: '#b91c1c', fontWeight: 700, fontSize: 12, marginTop: 2, borderRadius: 2 }}>
              <span>Due</span>
              <span>{formatCurrency((sale.totalAmount ?? 0) - (sale.amountPaid ?? 0))}</span>
            </div>
          )}
        </div>
      </div>

      {/* Payment + Notes row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, fontSize: isA4 ? 12 : 11, padding: '10px 14px', background: '#f8f8f8', borderRadius: 4 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>Payment Details</div>
          <div>Method: <strong>{sale.paymentMethod}</strong></div>
          <div>Status: <strong style={{ color: sale.paymentStatus === 'Paid' ? '#16a34a' : sale.paymentStatus === 'Partial' ? '#d97706' : '#dc2626' }}>{sale.paymentStatus}</strong></div>
        </div>
        {sale.notes && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, marginBottom: 3 }}>Notes</div>
            <div style={{ color: '#555' }}>{sale.notes}</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '2px solid #e5e5e5', paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 11, color: '#666' }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Terms & Conditions</div>
          <div>• Goods once sold will not be taken back.</div>
          <div>• Subject to local jurisdiction.</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #999', width: 120, paddingTop: 4, marginTop: 32 }}>Authorized Signatory</div>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid #e5e5e5', fontSize: 12 }}>
        <strong>ধন্যবাদ! Thank you for shopping with us!</strong>
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
