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

export interface StandardInvoiceProps {
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

export function StandardInvoice({
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
          <div>{L.status}: <strong style={{ 
            color: (() => {
              const paid = toMoneyNumber(sale.amountPaid);
              const total = toMoneyNumber(sale.totalAmount);
              return paid === 0 ? '#dc2626' : paid < total ? '#d97706' : '#16a34a';
            })()
          }}>{formatReceiptPaymentStatus(
            (() => {
              const status = String(sale.paymentStatus ?? '').toUpperCase();
              if (status === 'CANCELLED' || status === 'REFUNDED') return sale.paymentStatus || '';
              const total = toMoneyNumber(sale.totalAmount);
              const paid = toMoneyNumber(sale.amountPaid);
              if (paid === 0) return 'Due';
              if (paid < total) return 'Partial';
              return 'Paid';
            })()
          )}</strong></div>
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
