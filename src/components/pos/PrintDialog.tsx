"use client";

import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InvoicePreview, PrintInvoice } from "./PrintInvoice";
import type { Sale, PrintFormat } from "@/types/pos";
import { printToIframe } from "@/lib/printUtility";
import { useSettingsStore } from "@/stores/settings-store";
import { Share2, Printer } from "lucide-react";
import { shareInvoiceAsPdf } from "@/lib/invoicePdf";
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';

interface PrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
  onPrint?: (format: PrintFormat) => void;
}

const PRINT_FORMATS: {
  value: PrintFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "thermal-58",
    label: "Thermal 58mm",
    description: "Small receipt printer",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
  {
    value: "thermal-80",
    label: "Thermal 80mm",
    description: "Standard receipt printer",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
        />
      </svg>
    ),
  },
  {
    value: "a4",
    label: "A4 Paper",
    description: "Full page invoice",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
  {
    value: "a5",
    label: "A5 Paper",
    description: "Half page invoice",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
    ),
  },
];

function buildInvoiceHtml(
  sale: Sale,
  format: PrintFormat,
  showLogo: boolean,
  showGst: boolean,
  footerMessage: string,
  storeConfig: {
    name: string;
    nameBn: string;
    address: string;
    phone: string;
    gstNumber?: string;
  },
  pageStyle: string,
): string {
  const container = document.createElement("div");
  container.className = "print-invoice-container";
  container.setAttribute("data-format", format);
  container.innerHTML = renderToString(
    <PrintInvoice
      sale={sale}
      format={format}
      showLogo={showLogo}
      showGst={showGst}
      footerMessage={footerMessage}
      storeConfig={storeConfig}
    />,
  );

  const styleLinks = Array.from(
    document.querySelectorAll('link[rel="stylesheet"]'),
  )
    .map((l) => `<link rel="stylesheet" href="${(l as HTMLLinkElement).href}">`)
    .join("\n");
  const inlineStyles = Array.from(document.querySelectorAll("style"))
    .map((s) => `<style>${s.textContent}</style>`)
    .join("\n");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${styleLinks}${inlineStyles}<style>${pageStyle}</style></head><body>${container.outerHTML}</body></html>`;
}

function getPageStyle(format: PrintFormat): string {
  switch (format) {
    case "thermal-58":
      return `@page{size:58mm auto;margin:0}body{width:58mm;max-width:58mm;margin:0;padding:0}.thermal-invoice{width:56mm!important;max-width:56mm!important}`;
    case "thermal-80":
      return `@page{size:80mm auto;margin:0}body{width:80mm;max-width:80mm;margin:0;padding:0}.thermal-invoice{width:78mm!important;max-width:78mm!important}`;
    case "a4":
      return `@page{size:A4 portrait;margin:0.5cm}body{width:210mm;max-width:210mm;margin:0;padding:0}`;
    case "a5":
      return `@page{size:A5 portrait;margin:0.5cm}body{width:148mm;max-width:148mm;margin:0;padding:0}`;
    default:
      return `@page{size:auto;margin:1cm}`;
  }
}

function mapPaperSizeToFormat(size?: string): PrintFormat {
  switch (size) {
    case '58mm':
      return 'thermal-58';
    case '80mm':
      return 'thermal-80';
    case 'A4':
      return 'a4';
    case 'A5':
      return 'a5';
    default:
      return 'thermal-80';
  }
}

export function PrintDialog({
  open,
  onOpenChange,
  sale,
  onPrint,
}: PrintDialogProps) {
  const { settings } = useSettingsStore();
  const [selectedFormat, setSelectedFormat] = React.useState<PrintFormat>(() =>
    mapPaperSizeToFormat(settings.print_paper_size),
  );
  const [showLogo, setShowLogo] = React.useState(true);
  const [showGst, setShowGst] = React.useState(false);
  const [footerMessage, setFooterMessage] = React.useState(
    () => settings.print_footer || 'This is a computer generated invoice.',
  );
  const [isSharing, setIsSharing] = React.useState(false);
  const [isPrinting, setIsPrinting] = React.useState(false);
  const { toast } = useToast();
  const t = useTranslations("PrintDialog");

  const storeConfig = {
    name: settings.store_name || "Lakhan Bhandar",
    nameBn: settings.store_name_bn || "লক্ষ্মণ ভাণ্ডার",
    address: settings.store_address || "",
    phone: settings.store_phone || "",
    gstNumber: settings.store_gst || "",
    logo: settings.store_logo || "",
  };

  React.useEffect(() => {
    if (!open) return;
    setSelectedFormat(mapPaperSizeToFormat(settings.print_paper_size));
    if (settings.print_footer) setFooterMessage(settings.print_footer);
  }, [open, settings.print_paper_size, settings.print_footer]);

  const handlePrint = () => {
    if (!sale || isPrinting) return;
    setIsPrinting(true);
    const container = document.createElement("div");
    container.className = "print-invoice-container";
    container.setAttribute("data-format", selectedFormat);
    container.innerHTML = renderToString(
      <PrintInvoice
        sale={sale}
        format={selectedFormat}
        showLogo={showLogo}
        showGst={showGst}
        footerMessage={footerMessage}
        storeConfig={storeConfig}
      />,
    );
    printToIframe({
      printContent: container,
      pageStyle: getPageStyle(selectedFormat),
      format: selectedFormat,
      documentName: `Invoice-${sale.invoiceNumber}`,
      onAfterPrint: () => {
        setIsPrinting(false);
        onOpenChange(false);
        onPrint?.(selectedFormat);
      },
    });
    // Safety: clear printing flag if native path never calls onAfterPrint
    setTimeout(() => setIsPrinting(false), 8000);
  };

  /** One-tap PDF share (native sheet / download). Never shares HTML. */
  const handleShare = async () => {
    if (!sale || isSharing) return;
    setIsSharing(true);
    try {
      const html = buildInvoiceHtml(
        sale,
        selectedFormat,
        showLogo,
        showGst,
        footerMessage,
        storeConfig,
        getPageStyle(selectedFormat),
      );

      const result = await shareInvoiceAsPdf(
        html,
        selectedFormat,
        sale.invoiceNumber,
        storeConfig.name,
      );

      if (result === 'downloaded') {
        toast({
          title: t('downloaded') || 'Downloaded',
          description: t('downloaded_desc') || 'Invoice PDF downloaded.',
        });
      } else {
        toast({
          title: t('shared') || 'Shared',
          description: t('shared_desc') || 'Invoice shared successfully.',
        });
      }
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'AbortError') return;
      console.error('Share failed:', err);
      toast({
        title: t('share_failed') || 'Share failed',
        description: t('share_failed_desc') || 'Unable to share or download the invoice.',
        variant: 'destructive',
      });
    } finally {
      setIsSharing(false);
    }
  };

  if (!sale) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] md:max-w-4xl max-h-[95dvh] md:max-h-[90vh] overflow-hidden flex flex-col print-dialog-content p-3 md:p-6 w-[calc(100vw-1rem)] mx-auto">
        <DialogHeader className="no-print shrink-0">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('select_format')} #{sale.invoiceNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col md:flex-row gap-4">
          {/* Left Side - Options */}
          <div className="w-full md:w-72 shrink-0 space-y-3 no-print overflow-y-auto">
            <div className="space-y-3">
              <Label className="text-base font-semibold">{t('print_format')}</Label>
              <RadioGroup
                value={selectedFormat}
                onValueChange={(v) => setSelectedFormat(v as PrintFormat)}
                className="grid grid-cols-2 gap-2"
              >
                {PRINT_FORMATS.map((fmt) => (
                  <Label
                    key={fmt.value}
                    htmlFor={fmt.value}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-gray-50 ${selectedFormat === fmt.value ? "border-primary bg-primary/5" : "border-gray-200"}`}
                  >
                    <RadioGroupItem
                      value={fmt.value}
                      id={fmt.value}
                      className="sr-only"
                    />
                    {fmt.icon}
                    <div className="text-center">
                      <p className="font-medium text-sm">{fmt.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmt.description}
                      </p>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="text-base font-semibold">{t('options')}</Label>
              <div className="flex items-center justify-between">
                <Label htmlFor="show-logo" className="font-normal">
                  {t('show_logo')}
                </Label>
                <Switch
                  id="show-logo"
                  checked={showLogo}
                  onCheckedChange={setShowLogo}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="show-gst" className="font-normal">
                  {t('show_gst')}
                </Label>
                <Switch
                  id="show-gst"
                  checked={showGst}
                  onCheckedChange={setShowGst}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label
                htmlFor="footer-message"
                className="text-base font-semibold"
              >
                {t('footer_message')}
              </Label>
              <textarea
                id="footer-message"
                value={footerMessage}
                onChange={(e) => setFooterMessage(e.target.value)}
                className="w-full p-2 text-sm border rounded-md resize-none h-16"
                placeholder="Custom footer message..."
              />
            </div>

            {/* Share info */}
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">{t('share_invoice')}</p>
              <p>{t('share_mobile')}</p>
              <p>{t('share_desktop')}</p>
            </div>
          </div>

          {/* Right Side - Preview (hidden on mobile) */}
          <div className="hidden md:block flex-1 min-w-0">
            <ScrollArea className="h-[60vh] print-scroll-area">
              <InvoicePreview
                sale={sale}
                format={selectedFormat}
                showLogo={showLogo}
                showGst={showGst}
                footerMessage={footerMessage}
                storeConfig={storeConfig}
              />
            </ScrollArea>
          </div>
        </div>

        <Separator className="no-print" />

        <DialogFooter className="gap-2 no-print flex-wrap shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
          <Button
            variant="outline"
            onClick={handleShare}
            disabled={isSharing || isPrinting}
            className="gap-2 border-green-500 text-green-600 hover:bg-green-50"
          >
            <Share2 className="w-4 h-4" />
            {isSharing ? t('sharing') : t('share_whatsapp')}
          </Button>
          <Button
            onClick={handlePrint}
            disabled={isPrinting || isSharing}
            className="bg-blue-600 text-white hover:bg-blue-700 gap-2"
          >
            <Printer className="w-4 h-4" />
            {isPrinting ? (t('printing') || t('print_invoice')) : t('print_invoice')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PrintDialog;
