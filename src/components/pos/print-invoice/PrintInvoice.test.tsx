import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { PrintInvoice, DEFAULT_INVOICE_FOOTER } from './PrintInvoice';
import type { Sale } from '@/types/pos';

/**
 * Regression guard for the print path in PrintDialog.handlePrint(): it renders
 * the invoice with react-dom/server *outside* the React tree, where next-intl's
 * context does not exist. Any context hook inside PrintInvoice makes that call
 * throw, so window.print() is never reached and no print window opens.
 */
const sale: Sale = {
  id: 'sale-test-1',
  invoiceNumber: 'INV-TEST-0001',
  subtotal: 30,
  discount: 0,
  tax: 0,
  totalAmount: 30,
  amountPaid: 30,
  paymentMethod: 'Cash',
  paymentStatus: 'Paid',
  status: 'Completed',
  offlineSynced: true,
  createdAt: new Date('2026-10-19T14:35:00Z'),
  updatedAt: new Date('2026-10-19T14:35:00Z'),
  items: [
    {
      id: 'item-1',
      saleId: 'sale-test-1',
      productId: 'prod-1',
      productName: 'Test Product',
      quantity: 1,
      unitPrice: 30,
      totalPrice: 30,
      unit: 'pcs',
      createdAt: new Date('2026-10-19T14:35:00Z'),
    },
  ],
};

const storeConfig = {
  name: 'Test Store',
  nameBn: 'টেস্ট দোকান',
  address: 'Test Address',
  phone: '0000000000',
};

describe('PrintInvoice renderToString (print path)', () => {
  it('renders a thermal invoice without a NextIntlClientProvider', () => {
    const html = renderToString(
      <PrintInvoice sale={sale} format="thermal-80" storeConfig={storeConfig} />,
    );

    expect(html).toContain('INV-TEST-0001');
    expect(html).toContain('Test Product');
    expect(html).toContain(DEFAULT_INVOICE_FOOTER);
  });

  it('renders an A4 invoice without a NextIntlClientProvider', () => {
    const html = renderToString(
      <PrintInvoice
        sale={sale}
        format="a4"
        showGst
        storeConfig={storeConfig}
      />,
    );

    expect(html).toContain('INV-TEST-0001');
    expect(html).toContain('print-invoice-container');
  });
});
