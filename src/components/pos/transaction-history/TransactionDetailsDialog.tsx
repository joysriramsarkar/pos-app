import {
  Dialog,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Share2, X } from "lucide-react";
import { formatPrice, getPaymentStatusColor } from "./utils";
import { Transaction, TransactionItem } from "./types";
import { useState } from "react";
import { shareInvoiceAsPdf } from "@/lib/invoicePdf";
import { useSettingsStore } from "@/stores/settings-store";
import { useIsAdmin } from "@/hooks/use-permissions";
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';

interface TransactionDetailsDialogProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdateStatus: (status: "Cancelled" | "Refunded") => void;
}

export function TransactionDetailsDialog({
  transaction,
  isOpen,
  onOpenChange,
  onUpdateStatus,
}: TransactionDetailsDialogProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [preparedFile, setPreparedFile] = useState<File | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const { toast } = useToast();
  const { settings } = useSettingsStore();
  const isAdmin = useIsAdmin();

  const t = useTranslations('TransactionDetails');
  const tc = useTranslations('Common');
  const th = useTranslations('TransactionHistory');

  if (!transaction) return null;

  const storeConfig = {
    name: settings.store_name || "Lakhan Bhandar",
    nameBn: settings.store_name_bn || "লক্ষ্মণ ভাণ্ডার",
    address: settings.store_address || "",
    phone: settings.store_phone || "",
    gstNumber: settings.store_gst || "",
  };

  const getStatusText = (status: string) => {
    if (!status) return '';
    switch (status.toUpperCase()) {
      case 'COMPLETED':
        return t('completed');
      case 'CANCELLED':
        return t('cancelled');
      case 'REFUNDED':
        return t('refunded');
      default:
        return status;
    }
  };

  const getPaymentStatusText = (status: string) => {
    if (!status) return '';
    switch (status.toUpperCase()) {
      case 'PAID':
        return t('paid');
      case 'PARTIAL':
        return th('partial', { defaultValue: 'Partial' });
      case 'DUE':
        return t('due');
      default:
        return status;
    }
  };

  const getPaymentMethodText = (method: string) => {
    if (!method) return '';
    switch (method.toUpperCase()) {
      case 'CASH':
      case 'নগদ':
        return th('cash');
      case 'UPI':
      case 'ইউপিআই':
        return th('upi');
      case 'DUE':
      case 'বাকি':
        return th('due');
      case 'PREPAID':
      case 'আগাম জমা':
        return th('prepaid');
      case 'MIXED':
      case 'মিশ্র':
        return th('mixed');
      default:
        return method;
    }
  };

  const handleShare = async () => {
    setIsSharing(true);
    try {
      const printFormat = "a4" as const;

      // Build plain HTML invoice for PDF (no React renderToString needed)
      const itemRows = transaction.items
        .map((i, idx) => {
          const quantity = Number(i.quantity ?? 0);
          const unitPrice = Number(i.unitPrice ?? 0);
          const totalPrice = Number(i.totalPrice ?? 0);
          return `<tr><td>${idx + 1}</td><td>${i.productName}</td><td style="text-align:center">${quantity}${(i as any).unit || (i as any).product?.unit ? ` ${(i as any).unit || (i as any).product?.unit}` : ''}</td><td style="text-align:right">₹${unitPrice.toFixed(2)}</td><td style="text-align:right">₹${totalPrice.toFixed(2)}</td></tr>`;
        })
        .join("");
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        body{font-family:Arial,sans-serif;padding:20px;color:#000;background:#fff}
        h1{font-size:22px;margin:0}h2{font-size:14px;color:#555;margin:4px 0 0}
        .header{display:flex;justify-content:space-between;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;margin:12px 0}
        th{background:#f3f4f6;padding:8px;text-align:left;font-size:13px;border-bottom:2px solid #000}
        td{padding:7px 8px;font-size:13px;border-bottom:1px solid #e5e7eb}
        .total-row{font-weight:bold;font-size:15px;border-top:2px solid #000}
        .footer{margin-top:24px;text-align:center;color:#666;font-size:12px}
      </style></head><body>
        <div class="header">
          <div><h1>${storeConfig.name}</h1><h2>${storeConfig.nameBn}</h2><p style="font-size:12px;margin:4px 0">${storeConfig.address}</p><p style="font-size:12px;margin:0">Ph: ${storeConfig.phone}</p></div>
          <div style="text-align:right"><div style="border:2px solid #000;padding:8px 16px;display:inline-block"><b>TAX INVOICE</b></div><p style="font-size:13px;margin:8px 0 2px">Invoice: <b>${transaction.invoiceNumber}</b></p><p style="font-size:12px;margin:0">${format(transaction.createdAt, "dd/MM/yyyy HH:mm")}</p></div>
        </div>
        ${transaction.customer ? `<div style="background:#f9fafb;padding:10px;border-radius:6px;margin-bottom:12px"><b>Bill To:</b> ${transaction.customer.name}${transaction.customer.phone ? ` | ${transaction.customer.phone}` : ""}</div>` : ""}
        <table><thead><tr><th>#</th><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr></thead><tbody>${itemRows}</tbody></table>
        <div style="display:flex;justify-content:flex-end"><table style="width:260px">
          <tr><td>Subtotal:</td><td style="text-align:right">₹${(Number(transaction.totalAmount ?? 0) + Number(transaction.discount ?? 0) - Number(transaction.tax ?? 0)).toFixed(2)}</td></tr>
          ${(Number(transaction.discount ?? 0)) > 0 ? `<tr><td style="color:green">Discount:</td><td style="text-align:right;color:green">-₹${Number(transaction.discount ?? 0).toFixed(2)}</td></tr>` : ""}
          ${(Number(transaction.tax ?? 0)) > 0 ? `<tr><td>Tax:</td><td style="text-align:right">₹${Number(transaction.tax ?? 0).toFixed(2)}</td></tr>` : ""}
          <tr class="total-row"><td>Grand Total:</td><td style="text-align:right">₹${Number(transaction.totalAmount ?? 0).toFixed(2)}</td></tr>
          <tr><td>Amount Paid:</td><td style="text-align:right">₹${Number(transaction.amountPaid ?? 0).toFixed(2)}</td></tr>
          ${Number(transaction.totalAmount ?? 0) - Number(transaction.amountPaid ?? 0) > 0 ? `<tr><td style="color:red">Due:</td><td style="text-align:right;color:red">₹${(Number(transaction.totalAmount ?? 0) - Number(transaction.amountPaid ?? 0)).toFixed(2)}</td></tr>` : ""}
        </table></div>
        <p style="margin-top:12px;font-size:13px">Payment: <b>${transaction.paymentMethod}</b> (${transaction.paymentStatus})</p>
        <div class="footer"><p>ধন্যবাদ! Thank you for shopping with us!</p></div>
      </body></html>`;

      // If Capacitor native, use existing helper immediately
      try {
        const cap = await import('@capacitor/core').then(m => (m as any).Capacitor).catch(() => null);
        if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
          await shareInvoiceAsPdf(html, printFormat, transaction.invoiceNumber, storeConfig.name, '');
          return;
        }
      } catch {}

      setIsPreparing(true);
      const { generateInvoicePdf } = await import('@/lib/invoicePdf');
      const blob = await generateInvoicePdf(html, printFormat);
      const file = new File([blob], `Invoice-${transaction.invoiceNumber}.pdf`, { type: 'application/pdf' });
      setPreparedFile(file);
      toast({ title: t('invoice_ready'), description: t('invoice_ready_desc') });
    } catch (err: unknown) {
      if ((err instanceof Error ? err.name : "") !== "AbortError") {
        console.error("Share failed:", err);
      }
    } finally {
      setIsPreparing(false);
      setIsSharing(false);
    }
  };

  const performPreparedShare = async () => {
    if (!preparedFile) return;
    setIsSharing(true);
    try {
      const shareData: any = { title: `Invoice ${transaction.invoiceNumber}`, text: `Invoice from ${storeConfig.name}`, files: [preparedFile] };
      try {
        const canShare = typeof (navigator as any).canShare === 'function' ? (navigator as any).canShare(shareData) : true;
        if (canShare) {
          await (navigator as any).share(shareData);
          setPreparedFile(null);
          toast({ title: t('shared'), description: t('shared_desc') });
          onOpenChange(false);
          return;
        }
      } catch (err) {
        console.warn('navigator.share failed at performPreparedShare:', err);
      }

      // fallback to download
      try {
        const url = URL.createObjectURL(preparedFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = preparedFile.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setPreparedFile(null);
        toast({ title: t('downloaded'), description: t('downloaded_desc') });
      } catch (err) {
        toast({ title: t('share_failed'), description: t('share_failed_desc'), variant: 'destructive' });
      }
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-2xl w-[95vw] md:w-full p-0 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 md:px-6 md:py-4 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg md:text-xl font-semibold leading-tight">
              {t('title', { invoice: transaction.invoiceNumber })}
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
              {format(transaction.createdAt, "dd MMMM yyyy HH:mm:ss")}
            </p>
          </div>
          <DialogClose className="shrink-0 rounded-sm opacity-70 hover:opacity-100 transition-opacity mt-0.5">
            <X className="w-5 h-5" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 min-h-0 p-4 md:p-6">
          <div className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <Card className="bg-muted/30">
              <CardContent className="p-3 md:pt-4 md:p-6 pb-3 md:pb-4">
                <div className="text-xs md:text-sm text-muted-foreground">
                  {t('customer')}
                </div>
                <div className="font-semibold text-base md:text-lg mt-1">
                  {transaction.customer?.name || t('walk_in')}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="p-3 md:pt-4 md:p-6 pb-3 md:pb-4">
                <div className="text-xs md:text-sm text-muted-foreground">
                  {t('created_by')}
                </div>
                <div className="font-semibold text-base md:text-lg mt-1">
                  {transaction.user?.name || transaction.user?.username || t('unknown')}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">{t('items')}</h3>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('product')}</TableHead>
                  <TableHead className="text-right">{t('qty')}</TableHead>
                  <TableHead className="text-right">{t('unit_price')}</TableHead>
                  <TableHead className="text-right">{t('total')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transaction.items.map((item: TransactionItem, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell className="text-right">
                      {item.quantity}{(item as any).unit || (item as any).product?.unit ? ` ${(item as any).unit || (item as any).product?.unit}` : ''}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPrice(item.unitPrice)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatPrice(item.totalPrice)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-1.5 md:space-y-2 border-t pt-3 md:pt-4 text-sm md:text-base">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('subtotal')}:</span>
              <span>
                {formatPrice(
                  Number(transaction.totalAmount ?? 0) +
                    Number(transaction.discount ?? 0) -
                    Number(transaction.tax ?? 0),
                )}
              </span>
            </div>
            {(Number(transaction.discount ?? 0)) > 0 && (
              <div className="flex justify-between text-red-600">
                <span>{t('discount')}:</span>
                <span>-{formatPrice(Number(transaction.discount ?? 0))}</span>
              </div>
            )}
            {(Number(transaction.tax ?? 0)) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('tax')}:</span>
                <span>{formatPrice(Number(transaction.tax ?? 0))}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-base md:text-lg border-t pt-2 mt-2">
              <span>{t('total_amount')}:</span>
              <span>{formatPrice(Number(transaction.totalAmount ?? 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('amount_paid')}:</span>
              <span className="font-semibold">
                {formatPrice(Number(transaction.amountPaid ?? 0))}
              </span>
            </div>
            {(Number(transaction.totalAmount ?? 0) - Number(transaction.amountPaid ?? 0)) > 0 && (
              <div className="flex justify-between text-red-600 font-semibold">
                <span>{t('due')}:</span>
                <span>
                  {formatPrice(
                    Number(transaction.totalAmount ?? 0) - Number(transaction.amountPaid ?? 0),
                  )}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <Card className="bg-muted/30">
              <CardContent className="p-3 md:pt-4 md:p-6 pb-3 md:pb-4">
                <div className="text-xs md:text-sm text-muted-foreground">
                  {t('payment_method')}
                </div>
                <Badge variant="outline" className="mt-2">
                  {getPaymentMethodText(transaction.paymentMethod)}
                </Badge>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="p-3 md:pt-4 md:p-6 pb-3 md:pb-4">
                <div className="text-xs md:text-sm text-muted-foreground">
                  {t('payment_status')}
                </div>
                <Badge
                  className={`mt-2 ${getPaymentStatusColor(transaction.paymentStatus)}`}
                >
                  {getPaymentStatusText(transaction.paymentStatus)}
                </Badge>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-between border rounded-lg px-4 py-3 bg-muted/30">
            <span className="text-sm text-muted-foreground">{t('order_status')}</span>
            <Badge
              variant={transaction.status === 'Completed' ? 'default' : 'destructive'}
              className={transaction.status === 'Cancelled' ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400' : transaction.status === 'Refunded' ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400' : ''}
            >
              {getStatusText(transaction.status)}
            </Badge>
          </div>

          <div className="flex flex-col gap-3 mt-4">
            <div className="text-sm font-medium">{t('actions')}</div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={preparedFile ? performPreparedShare : handleShare}
                disabled={isSharing}
                className="h-10 gap-2 border-green-500 text-green-600 hover:bg-green-50"
              >
                <Share2 className="w-4 h-4" />
                {isPreparing ? t('preparing') : preparedFile ? (isSharing ? t('sharing') : t('tap_to_share')) : (isSharing ? t('sharing') : t('share_whatsapp'))}
              </Button>
              {isAdmin && transaction.status === "Completed" && (
                <>
                  <Button
                    variant="destructive"
                    onClick={() => onUpdateStatus("Cancelled")}
                    className="h-10"
                  >
                    {t('cancel_order')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onUpdateStatus("Refunded")}
                    className="h-10"
                  >
                    {t('refund_order')}
                  </Button>
                </>
              )}
            </div>
          </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
