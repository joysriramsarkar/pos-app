'use client';

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
import { formatCurrency, formatDate, formatTime } from './types-and-utils';

export interface ThermalInvoiceProps {
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

export function ThermalInvoice({
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
