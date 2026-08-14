import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
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
import { Share2, X, Printer } from "lucide-react";
import { getPaymentStatusColor } from "./utils";
import { Transaction, TransactionItem } from "./types";
import { useState, useEffect } from "react";
import { shareInvoiceFromSale, preloadPdfLibs } from "@/lib/invoicePdf";
import { useSettingsStore } from "@/stores/settings-store";
import { useIsAdmin } from "@/hooks/use-permissions";
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { useNumberFormat } from "@/hooks/use-number-format";
import { PrintDialog } from "../PrintDialog";

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
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const { toast } = useToast();
  const { settings } = useSettingsStore();
  const isAdmin = useIsAdmin();
  const { formatPrice } = useNumberFormat();

  const t = useTranslations('TransactionDetails');
  const tc = useTranslations('Common');
  const th = useTranslations('TransactionHistory');
  const locale = useLocale();

  useEffect(() => {
    if (isOpen) preloadPdfLibs();
  }, [isOpen]);

  if (!transaction) return null;

  const customerName = locale === 'en' && transaction.customer?.nameEn
    ? transaction.customer.nameEn
    : transaction.customer?.name;

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

  const saleMapped = transaction ? {
    id: transaction.id,
    invoiceNumber: transaction.invoiceNumber,
    customerId: transaction.customer?.id,
    userId: transaction.user?.id,
    subtotal: Number(transaction.totalAmount ?? 0) + Number(transaction.discount ?? 0) - Number(transaction.tax ?? 0),
    discount: Number(transaction.discount ?? 0),
    tax: Number(transaction.tax ?? 0),
    totalAmount: Number(transaction.totalAmount ?? 0),
    amountPaid: Number(transaction.amountPaid ?? 0),
    paymentMethod: transaction.paymentMethod as any,
    paymentStatus: transaction.paymentStatus as any,
    status: transaction.status as any,
    offlineSynced: true,
    createdAt: new Date(transaction.createdAt),
    updatedAt: new Date(transaction.createdAt),
    customer: transaction.customer ? {
      id: transaction.customer.id,
      name: transaction.customer.name,
      phone: transaction.customer.phone || "",
      address: "",
      totalDue: 0,
      totalPaid: 0,
      prepaidBalance: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    } : undefined,
    user: transaction.user,
    items: transaction.items.map(item => ({
      id: item.id,
      saleId: transaction.id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      unit: item.unit || "",
      createdAt: new Date(transaction.createdAt)
    }))
  } : null;

  const handleShare = async () => {
    if (isSharing || !saleMapped) return;
    setIsSharing(true);
    try {
      const result = await shareInvoiceFromSale(saleMapped as any, 'a4', {
        name: storeConfig.name,
        nameBn: storeConfig.nameBn,
        address: storeConfig.address,
        phone: storeConfig.phone,
        gstNumber: storeConfig.gstNumber,
      });
      if (result === 'downloaded') {
        toast({ title: t('downloaded'), description: t('downloaded_desc') });
      } else {
        toast({ title: t('shared'), description: t('shared_desc') });
      }
    } catch (err: unknown) {
      if ((err instanceof Error ? err.name : '') !== 'AbortError') {
        console.error('Share failed:', err);
        toast({ title: t('share_failed'), description: t('share_failed_desc'), variant: 'destructive' });
      }
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="max-w-2xl w-[95vw] md:w-full p-0 overflow-hidden flex flex-col max-h-[85vh]">
          {/* Sticky header */}
          <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 md:px-6 md:py-4 flex items-start justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <DialogTitle className="text-lg md:text-xl font-semibold leading-tight">
                {t('title', { invoice: transaction.invoiceNumber })}
              </DialogTitle>
              <DialogDescription className="text-xs md:text-sm text-muted-foreground mt-0.5">
                {format(transaction.createdAt, "dd MMMM yyyy HH:mm:ss")}
              </DialogDescription>
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
                    {customerName || t('walk_in')}
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
                  onClick={() => setIsPrintOpen(true)}
                  className="h-10 gap-2 border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                >
                  <Printer className="w-4 h-4" />
                  {tc('print') || 'Print'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleShare}
                  disabled={isSharing}
                  className="h-10 gap-2 border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20"
                >
                  <Share2 className="w-4 h-4" />
                  {isSharing ? t('sharing') : t('share_whatsapp')}
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
      <PrintDialog
        open={isPrintOpen}
        onOpenChange={setIsPrintOpen}
        sale={saleMapped}
      />
    </>
  );
}
