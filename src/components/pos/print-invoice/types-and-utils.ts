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

export interface PrintInvoiceProps {
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

export const formatCurrency = (amount: number | string | null | undefined): string => {
  return formatReceiptMoney(amount);
};

export const formatDate = (date: Date): string => formatReceiptDate(date);
export const formatTime = (date: Date): string => formatReceiptTime(date);

// ============================================================================
// THERMAL INVOICE (58mm and 80mm)
// ============================================================================

