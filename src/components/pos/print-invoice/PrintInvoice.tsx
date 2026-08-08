'use client';

import * as React from "react";
import type { Sale, PrintFormat } from "@/types/pos";
import type { PrintInvoiceProps } from './types-and-utils';
import { ThermalInvoice } from './ThermalInvoice';
import { StandardInvoice } from './StandardInvoice';
import { useTranslations } from 'next-intl';

export type { PrintInvoiceProps } from './types-and-utils';

export function PrintInvoice({
  sale,
  format,
  showLogo = true,
  showGst = false,
  footerMessage,
  className = "",
  storeConfig,
}: PrintInvoiceProps) {
  const invoiceRef = React.useRef<HTMLDivElement>(null);
  const tc = useTranslations('Common');
  const effectiveFooter = footerMessage ?? tc('invoice_footer_default');

  const renderInvoice = () => {
    switch (format) {
      case "thermal-58":
        return (
          <ThermalInvoice
            sale={sale}
            width="58mm"
            showLogo={showLogo}
            footerMessage={effectiveFooter}
            storeConfig={storeConfig}
          />
        );
      case "thermal-80":
        return (
          <ThermalInvoice
            sale={sale}
            width="80mm"
            showLogo={showLogo}
            footerMessage={effectiveFooter}
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
            footerMessage={effectiveFooter}
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
