'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Printer, X, FileText, Ruler } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSettingsStore } from '@/stores/settings-store';

export interface ReceiptPrintProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleData: {
    invoiceNumber: string;
    createdAt: string;
    customerName: string | null;
    cashierName?: string;
    items: Array<{
      productName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      unit: string;
    }>;
    subtotal: number;
    discount: number;
    tax: number;
    totalAmount: number;
    amountPaid: number;
    paymentMethod: string;
    paymentStatus: string;
  } | null;
}

type ReceiptSize = 'thermal' | 'a4';

// Helper: format date in Bengali
function formatBengaliDate(dateStr: string): string {
  const date = new Date(dateStr);
  const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  const bengaliMonths = [
    'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
    'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
  ];
  const bengaliDays = [
    'রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার',
  ];

  const toBn = (n: number) => String(n).replace(/\d/g, (d) => bengaliDigits[parseInt(d)]);

  const day = bengaliDays[date.getDay()];
  const d = toBn(date.getDate());
  const m = bengaliMonths[date.getMonth()];
  const y = toBn(date.getFullYear());

  const hours = date.getHours();
  const minutes = toBn(date.getMinutes());
  const period = hours >= 12 ? 'পিএম' : 'এএম';
  const h12 = toBn(hours % 12 || 12);

  return `${d} ${m} ${y}, ${day} ${h12}:${minutes} ${period}`;
}

// Helper: convert number to Bengali digits
function toBnNum(n: number | string): string {
  const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(n).replace(/\d/g, (d) => bengaliDigits[parseInt(d)]);
}

// Dashed line separator component
function DashedLine() {
  return (
    <div className="border-b border-dashed border-gray-400 my-1 receipt-dashed-line" />
  );
}

export default function ReceiptPrint({ open, onOpenChange, saleData }: ReceiptPrintProps) {
  const t = useTranslations('Receipt');
  const { settings } = useSettingsStore();
  const [receiptSize, setReceiptSize] = useState<ReceiptSize>('thermal');

  const currency = settings.currency_symbol || '৳';

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // Get payment method label in Bengali
  const getPaymentMethodLabel = (method: string): string => {
    switch (method) {
      case 'Cash':
      case 'নগদ': return 'নগদ';
      case 'UPI':
      case 'ইউপিআই': return 'ইউপিআই';
      case 'Mixed':
      case 'মিশ্র': return 'মিশ্র';
      case 'Due':
      case 'বাকি': return 'বাকি';
      case 'Prepaid': return 'প্রিপেইড';
      default: return method;
    }
  };

  if (!saleData) return null;

  const balanceDue = Math.max(0, saleData.totalAmount - saleData.amountPaid);

  // Thermal receipt view
  const ThermalReceipt = (
    <div id="receipt-content" className="receipt-thermal bg-white text-black p-4 font-mono text-xs leading-relaxed max-w-[80mm] mx-auto">
      {/* Header */}
      <div className="text-center space-y-0.5">
        <h2 className="text-lg font-bold">{settings.store_name_bn || settings.store_name || 'লক্ষ্মণ ভাণ্ডার'}</h2>
        {settings.store_address && (
          <p className="text-[10px]">{settings.store_address}</p>
        )}
        {settings.store_phone && (
          <p className="text-[10px]">📞 {settings.store_phone}</p>
        )}
        {settings.store_gst && (
          <p className="text-[10px]">GST: {settings.store_gst}</p>
        )}
      </div>

      <DashedLine />

      {/* Invoice Info */}
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>{t('invoice')}:</span>
          <span className="font-semibold">{saleData.invoiceNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>{t('date_time')}:</span>
          <span>{formatBengaliDate(saleData.createdAt)}</span>
        </div>
        {saleData.customerName && (
          <div className="flex justify-between">
            <span>{t('customer')}:</span>
            <span>{saleData.customerName}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>{t('cashier')}:</span>
          <span>{saleData.cashierName || 'অ্যাডমিন'}</span>
        </div>
      </div>

      <DashedLine />

      {/* Items Table */}
      <div className="space-y-1">
        {/* Table Header */}
        <div className="flex text-[10px] font-bold">
          <span className="flex-[3]">{t('product')}</span>
          <span className="flex-[1] text-center">{t('qty')}</span>
          <span className="flex-[1.5] text-right">{t('price')}</span>
          <span className="flex-[1.5] text-right">{t('total')}</span>
        </div>
        <DashedLine />
        {/* Item Rows */}
        {saleData.items.map((item, idx) => (
          <div key={idx} className="text-[10px]">
            <div className="flex">
              <span className="flex-[3] truncate">{item.productName}</span>
              <span className="flex-[1] text-center">{toBnNum(item.quantity)}</span>
              <span className="flex-[1.5] text-right">{currency}{item.unitPrice}</span>
              <span className="flex-[1.5] text-right">{currency}{item.totalPrice}</span>
            </div>
          </div>
        ))}
      </div>

      <DashedLine />

      {/* Summary */}
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>{t('subtotal')}:</span>
          <span>{currency}{saleData.subtotal.toFixed(2)}</span>
        </div>
        {saleData.discount > 0 && (
          <div className="flex justify-between">
            <span>{t('discount')}:</span>
            <span>-{currency}{saleData.discount.toFixed(2)}</span>
          </div>
        )}
        {saleData.tax > 0 && (
          <div className="flex justify-between">
            <span>{t('tax')}:</span>
            <span>{currency}{saleData.tax.toFixed(2)}</span>
          </div>
        )}
      </div>

      <DashedLine />

      {/* Grand Total */}
      <div className="flex justify-between text-sm font-bold py-1">
        <span>{t('grand_total')}:</span>
        <span>{currency}{saleData.totalAmount.toFixed(2)}</span>
      </div>

      <DashedLine />

      {/* Payment Details */}
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>{t('paid')}:</span>
          <span>{currency}{saleData.amountPaid.toFixed(2)}</span>
        </div>
        {balanceDue > 0 && (
          <div className="flex justify-between font-semibold">
            <span>{t('balance_due')}:</span>
            <span>{currency}{balanceDue.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>{t('payment_method')}:</span>
          <span>{getPaymentMethodLabel(saleData.paymentMethod)}</span>
        </div>
      </div>

      <DashedLine />

      {/* Footer */}
      <div className="text-center space-y-1 pt-1">
        {settings.print_footer && (
          <p className="text-[10px]">{settings.print_footer}</p>
        )}
        <p className="text-[11px] font-semibold">{t('thank_you')}</p>
        {settings.store_phone && (
          <p className="text-[10px]">{settings.store_phone}</p>
        )}
      </div>
    </div>
  );

  // A4 receipt view
  const A4Receipt = (
    <div id="receipt-content" className="receipt-a4 bg-white text-black p-8 max-w-[210mm] mx-auto">
      {/* Header */}
      <div className="text-center border-b-2 border-black pb-3 mb-4">
        <h2 className="text-2xl font-bold">{settings.store_name_bn || settings.store_name || 'লক্ষ্মণ ভাণ্ডার'}</h2>
        {settings.store_address && (
          <p className="text-sm text-gray-700">{settings.store_address}</p>
        )}
        {settings.store_phone && (
          <p className="text-sm text-gray-700">📞 {settings.store_phone}</p>
        )}
        {settings.store_gst && (
          <p className="text-sm text-gray-700">GST: {settings.store_gst}</p>
        )}
      </div>

      {/* Invoice Info */}
      <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
        <div>
          <p><span className="text-gray-600">{t('invoice')}:</span> <span className="font-semibold">{saleData.invoiceNumber}</span></p>
          <p><span className="text-gray-600">{t('customer')}:</span> {saleData.customerName || t('walk_in')}</p>
        </div>
        <div className="text-right">
          <p><span className="text-gray-600">{t('date_time')}:</span> {formatBengaliDate(saleData.createdAt)}</p>
          <p><span className="text-gray-600">{t('cashier')}:</span> {saleData.cashierName || 'অ্যাডমিন'}</p>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full text-sm mb-4 border-collapse">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="text-left py-2">{t('product')}</th>
            <th className="text-center py-2">{t('qty')}</th>
            <th className="text-right py-2">{t('price')}</th>
            <th className="text-right py-2">{t('total')}</th>
          </tr>
        </thead>
        <tbody>
          {saleData.items.map((item, idx) => (
            <tr key={idx} className="border-b border-gray-300">
              <td className="py-1.5">{item.productName}</td>
              <td className="text-center py-1.5">{toBnNum(item.quantity)} {item.unit}</td>
              <td className="text-right py-1.5">{currency}{item.unitPrice.toFixed(2)}</td>
              <td className="text-right py-1.5">{currency}{item.totalPrice.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary */}
      <div className="flex justify-end mb-4">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">{t('subtotal')}:</span>
            <span>{currency}{saleData.subtotal.toFixed(2)}</span>
          </div>
          {saleData.discount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">{t('discount')}:</span>
              <span>-{currency}{saleData.discount.toFixed(2)}</span>
            </div>
          )}
          {saleData.tax > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">{t('tax')}:</span>
              <span>{currency}{saleData.tax.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t-2 border-black flex justify-between font-bold text-base pt-1">
            <span>{t('grand_total')}:</span>
            <span>{currency}{saleData.totalAmount.toFixed(2)}</span>
          </div>
          <DashedLine />
          <div className="flex justify-between">
            <span className="text-gray-600">{t('paid')}:</span>
            <span>{currency}{saleData.amountPaid.toFixed(2)}</span>
          </div>
          {balanceDue > 0 && (
            <div className="flex justify-between font-semibold">
              <span>{t('balance_due')}:</span>
              <span>{currency}{balanceDue.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">{t('payment_method')}:</span>
            <span>{getPaymentMethodLabel(saleData.paymentMethod)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t-2 border-black pt-3 text-center">
        {settings.print_footer && (
          <p className="text-sm text-gray-600">{settings.print_footer}</p>
        )}
        <p className="text-base font-semibold">{t('thank_you')}</p>
        {settings.store_phone && (
          <p className="text-sm text-gray-600">{settings.store_phone}</p>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('print_receipt')}</DialogDescription>
        </DialogHeader>

        {/* Size Toggle */}
        <div className="flex items-center gap-2 pb-2 border-b no-print shrink-0">
          <Ruler className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{t('receipt_size')}:</span>
          <Button
            variant={receiptSize === 'thermal' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setReceiptSize('thermal')}
          >
            {t('thermal')}
          </Button>
          <Button
            variant={receiptSize === 'a4' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setReceiptSize('a4')}
          >
            {t('a4')}
          </Button>
        </div>

        {/* Receipt Preview */}
        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6 bg-gray-100 dark:bg-gray-900 rounded-md">
          <div className="py-4 flex justify-center">
            {receiptSize === 'thermal' ? ThermalReceipt : A4Receipt}
          </div>
        </ScrollArea>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2 border-t no-print shrink-0">
          <Button
            className="flex-1 h-11 bg-primary hover:bg-primary/90 shadow-md font-semibold"
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4 mr-1.5" />
            {t('print')}
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-11"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4 mr-1.5" />
            {t('close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
