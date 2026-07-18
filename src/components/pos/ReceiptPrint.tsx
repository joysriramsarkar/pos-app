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
import {
  getReceiptLanguage,
  getReceiptLabels,
  getReceiptStoreTitle,
  formatReceiptMoney,
  formatReceiptNumber,
  formatReceiptDateTime,
  formatReceiptPaymentMethod,
} from '@/lib/receipt-i18n';

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

// Dashed line separator component
function DashedLine() {
  return (
    <div className="border-b border-dashed border-gray-400 my-1 receipt-dashed-line" />
  );
}

export default function ReceiptPrint({ open, onOpenChange, saleData }: ReceiptPrintProps) {
  // Dialog chrome follows app UI language; receipt body follows receipt_language
  const t = useTranslations('Receipt');
  const { settings } = useSettingsStore();
  const [receiptSize, setReceiptSize] = useState<ReceiptSize>('thermal');

  const lang = getReceiptLanguage();
  const L = getReceiptLabels(lang);
  const storeTitle = getReceiptStoreTitle(
    {
      name: settings.store_name || 'Lakhan Bhandar',
      nameBn: settings.store_name_bn || 'লক্ষ্মণ ভাণ্ডার',
    },
    lang,
  );

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (!saleData) return null;

  const balanceDue = Math.max(0, saleData.totalAmount - saleData.amountPaid);
  const money = (n: number) => formatReceiptMoney(n, lang);
  const num = (n: number | string) => formatReceiptNumber(n, undefined, lang);

  // Thermal receipt view
  const ThermalReceipt = (
    <div id="receipt-content" className="receipt-thermal bg-white text-black p-4 font-mono text-xs leading-relaxed max-w-[80mm] mx-auto">
      {/* Header */}
      <div className="text-center space-y-0.5">
        <h2 className="text-lg font-bold">{storeTitle.primary}</h2>
        {storeTitle.secondary && (
          <p className="text-[11px] font-medium">{storeTitle.secondary}</p>
        )}
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
          <span>{L.invoice}:</span>
          <span className="font-semibold">{saleData.invoiceNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>{L.dateTime}:</span>
          <span>{formatReceiptDateTime(saleData.createdAt, lang)}</span>
        </div>
        {saleData.customerName && (
          <div className="flex justify-between">
            <span>{L.customer}:</span>
            <span>{saleData.customerName}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>{L.cashier}:</span>
          <span>{saleData.cashierName || L.admin}</span>
        </div>
      </div>

      <DashedLine />

      {/* Items Table */}
      <div className="space-y-1">
        <div className="flex text-[10px] font-bold">
          <span className="flex-[3]">{L.product}</span>
          <span className="flex-[1] text-center">{L.qty}</span>
          <span className="flex-[1.5] text-right">{L.price}</span>
          <span className="flex-[1.5] text-right">{L.total}</span>
        </div>
        <DashedLine />
        {saleData.items.map((item, idx) => (
          <div key={idx} className="text-[10px]">
            <div className="flex">
              <span className="flex-[3] truncate">{item.productName}</span>
              <span className="flex-[1] text-center">{num(item.quantity)}</span>
              <span className="flex-[1.5] text-right">{money(item.unitPrice)}</span>
              <span className="flex-[1.5] text-right">{money(item.totalPrice)}</span>
            </div>
          </div>
        ))}
      </div>

      <DashedLine />

      {/* Summary */}
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>{L.subtotal}:</span>
          <span>{money(saleData.subtotal)}</span>
        </div>
        {saleData.discount > 0 && (
          <div className="flex justify-between">
            <span>{L.discount}:</span>
            <span>-{money(saleData.discount)}</span>
          </div>
        )}
        {saleData.tax > 0 && (
          <div className="flex justify-between">
            <span>{L.tax}:</span>
            <span>{money(saleData.tax)}</span>
          </div>
        )}
      </div>

      <DashedLine />

      {/* Grand Total */}
      <div className="flex justify-between text-sm font-bold py-1">
        <span>{L.grandTotal}:</span>
        <span>{money(saleData.totalAmount)}</span>
      </div>

      <DashedLine />

      {/* Payment Details */}
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>{L.paid}:</span>
          <span>{money(saleData.amountPaid)}</span>
        </div>
        {balanceDue > 0 && (
          <div className="flex justify-between font-semibold">
            <span>{L.balanceDue}:</span>
            <span>{money(balanceDue)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>{L.paymentMethod}:</span>
          <span>{formatReceiptPaymentMethod(saleData.paymentMethod, lang)}</span>
        </div>
      </div>

      <DashedLine />

      {/* Footer */}
      <div className="text-center space-y-1 pt-1">
        {settings.print_footer && (
          <p className="text-[10px]">{settings.print_footer}</p>
        )}
        <p className="text-[11px] font-semibold">{L.thankYou}</p>
        {settings.store_phone && (
          <p className="text-[10px]">{settings.store_phone}</p>
        )}
      </div>
    </div>
  );

  // A4 receipt view
  const A4Receipt = (
    <div id="receipt-content" className="receipt-a4 bg-white text-black p-8 max-w-[210mm] mx-auto">
      <div className="text-center border-b-2 border-black pb-3 mb-4">
        <h2 className="text-2xl font-bold">{storeTitle.primary}</h2>
        {storeTitle.secondary && (
          <p className="text-sm font-medium text-gray-700">{storeTitle.secondary}</p>
        )}
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

      <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
        <div>
          <p><span className="text-gray-600">{L.invoice}:</span> <span className="font-semibold">{saleData.invoiceNumber}</span></p>
          <p><span className="text-gray-600">{L.customer}:</span> {saleData.customerName || L.walkIn}</p>
        </div>
        <div className="text-right">
          <p><span className="text-gray-600">{L.dateTime}:</span> {formatReceiptDateTime(saleData.createdAt, lang)}</p>
          <p><span className="text-gray-600">{L.cashier}:</span> {saleData.cashierName || L.admin}</p>
        </div>
      </div>

      <table className="w-full text-sm mb-4 border-collapse">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="text-left py-2">{L.product}</th>
            <th className="text-center py-2">{L.qty}</th>
            <th className="text-right py-2">{L.price}</th>
            <th className="text-right py-2">{L.total}</th>
          </tr>
        </thead>
        <tbody>
          {saleData.items.map((item, idx) => (
            <tr key={idx} className="border-b border-gray-300">
              <td className="py-1.5">{item.productName}</td>
              <td className="text-center py-1.5">{num(item.quantity)} {item.unit}</td>
              <td className="text-right py-1.5">{money(item.unitPrice)}</td>
              <td className="text-right py-1.5">{money(item.totalPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end mb-4">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">{L.subtotal}:</span>
            <span>{money(saleData.subtotal)}</span>
          </div>
          {saleData.discount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">{L.discount}:</span>
              <span>-{money(saleData.discount)}</span>
            </div>
          )}
          {saleData.tax > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">{L.tax}:</span>
              <span>{money(saleData.tax)}</span>
            </div>
          )}
          <div className="border-t-2 border-black flex justify-between font-bold text-base pt-1">
            <span>{L.grandTotal}:</span>
            <span>{money(saleData.totalAmount)}</span>
          </div>
          <DashedLine />
          <div className="flex justify-between">
            <span className="text-gray-600">{L.paid}:</span>
            <span>{money(saleData.amountPaid)}</span>
          </div>
          {balanceDue > 0 && (
            <div className="flex justify-between font-semibold">
              <span>{L.balanceDue}:</span>
              <span>{money(balanceDue)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">{L.paymentMethod}:</span>
            <span>{formatReceiptPaymentMethod(saleData.paymentMethod, lang)}</span>
          </div>
        </div>
      </div>

      <div className="border-t-2 border-black pt-3 text-center">
        {settings.print_footer && (
          <p className="text-sm text-gray-600">{settings.print_footer}</p>
        )}
        <p className="text-base font-semibold">{L.thankYou}</p>
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

        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6 bg-gray-100 dark:bg-gray-900 rounded-md">
          <div className="py-4 flex justify-center">
            {receiptSize === 'thermal' ? ThermalReceipt : A4Receipt}
          </div>
        </ScrollArea>

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
            className="h-11"
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
