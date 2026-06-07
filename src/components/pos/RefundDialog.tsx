'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  RotateCcw, AlertTriangle, Package, Wallet, CheckCircle, Loader2,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settings-store';

interface RefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: {
    id: string;
    invoiceNumber: string;
    customerId: string | null;
    totalAmount: number;
    amountPaid: number;
    paymentMethod: string;
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      unit: string;
    }>;
  } | null;
  onSuccess: () => void;
}

export default function RefundDialog({ open, onOpenChange, sale, onSuccess }: RefundDialogProps) {
  const t = useTranslations('Refund');
  const tc = useTranslations('Common');
  const currency = useSettingsStore((s) => s.settings.currency_symbol || '৳');

  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [refundQuantities, setRefundQuantities] = useState<Record<string, number>>({});
  const [refundMethod, setRefundMethod] = useState<'নগদ' | 'বাকি'>('নগদ');
  const [isFullRefund, setIsFullRefund] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const initializeSale = () => {
    if (sale) {
      const initialSelected: Record<string, boolean> = {};
      const initialQty: Record<string, number> = {};
      sale.items.forEach((item) => {
        initialSelected[item.productId] = false;
        initialQty[item.productId] = 0;
      });
      setSelectedItems(initialSelected);
      setRefundQuantities(initialQty);
      setIsFullRefund(false);
      setRefundMethod('নগদ');
      setShowConfirm(false);
    }
  };

  const handleFullRefundToggle = (checked: boolean) => {
    setIsFullRefund(checked);
    if (checked && sale) {
      const newSelected: Record<string, boolean> = {};
      const newQty: Record<string, number> = {};
      sale.items.forEach((item) => {
        newSelected[item.productId] = true;
        newQty[item.productId] = item.quantity;
      });
      setSelectedItems(newSelected);
      setRefundQuantities(newQty);
    } else if (sale) {
      const newSelected: Record<string, boolean> = {};
      const newQty: Record<string, number> = {};
      sale.items.forEach((item) => {
        newSelected[item.productId] = false;
        newQty[item.productId] = 0;
      });
      setSelectedItems(newSelected);
      setRefundQuantities(newQty);
    }
  };

  const handleItemToggle = (productId: string, checked: boolean) => {
    setSelectedItems((prev) => ({ ...prev, [productId]: checked }));
    if (sale) {
      const item = sale.items.find((i) => i.productId === productId);
      if (item) {
        setRefundQuantities((prev) => ({
          ...prev,
          [productId]: checked ? item.quantity : 0,
        }));
      }
    }
    setIsFullRefund(false);
  };

  const handleQuantityChange = (productId: string, qty: number) => {
    if (sale) {
      const item = sale.items.find((i) => i.productId === productId);
      if (item) {
        const clampedQty = Math.max(0, Math.min(qty, item.quantity));
        setRefundQuantities((prev) => ({ ...prev, [productId]: clampedQty }));
      }
    }
  };

  const refundAmount = useMemo(() => {
    if (!sale) return 0;
    let total = 0;
    sale.items.forEach((item) => {
      if (selectedItems[item.productId]) {
        const qty = refundQuantities[item.productId] || 0;
        total += item.unitPrice * qty;
      }
    });
    if (sale.totalAmount > 0) {
      const itemsSum = sale.items.reduce((s, i) => s + i.totalPrice, 0);
      if (itemsSum > 0 && Math.abs(sale.totalAmount - itemsSum) > 0.01) {
        const ratio = sale.totalAmount / itemsSum;
        total = total * ratio;
      }
    }
    return Math.round(total * 100) / 100;
  }, [sale, selectedItems, refundQuantities]);

  const hasSelectedItems = useMemo(() => {
    return Object.values(selectedItems).some((v) => v) &&
      Object.entries(refundQuantities).some(([pid, qty]) => selectedItems[pid] && qty > 0);
  }, [selectedItems, refundQuantities]);

  const handleConfirmRefund = async () => {
    if (!sale || !hasSelectedItems) return;

    setSubmitting(true);
    try {
      const refundItems = sale.items
        .filter((item) => selectedItems[item.productId] && (refundQuantities[item.productId] || 0) > 0)
        .map((item) => ({
          productId: item.productId,
          quantity: refundQuantities[item.productId] || 0,
        }));

      const res = await fetch('/api/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId: sale.id,
          items: refundItems,
          refundMethod,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success(t('refund_success'), {
          description: t('refund_success_desc', { invoice: sale.invoiceNumber }),
        });
        setShowConfirm(false);
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(t('refund_failed'), {
          description: data.error || 'রিফান্ড ব্যর্থ হয়েছে',
        });
      }
    } catch {
      toast.error(t('refund_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      initializeSale();
    }
    onOpenChange(newOpen);
  };

  if (!sale) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-orange-600" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('refund_confirm_message')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Original Sale Summary */}
          <div className="bg-muted/50 p-4 rounded-lg border">
            <h3 className="font-medium text-sm uppercase tracking-wider text-muted-foreground mb-2">
              {t('original_sale')}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">ইনভয়েস</p>
                <p className="font-mono font-medium text-sm">{sale.invoiceNumber}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">মোট পরিমাণ</p>
                <p className="font-bold text-sm">{currency}{sale.totalAmount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">পেমেন্ট পদ্ধতি</p>
                <Badge variant="secondary">{sale.paymentMethod}</Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Full Refund Toggle */}
          <div className="flex items-center justify-between bg-orange-50 dark:bg-orange-950/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-orange-600" />
              <span className="font-medium text-sm">{t('full_refund')}</span>
            </div>
            <Checkbox
              checked={isFullRefund}
              onCheckedChange={(checked) => handleFullRefundToggle(checked === true)}
            />
          </div>

          {/* Items Selection */}
          <div>
            <h3 className="font-medium text-sm uppercase tracking-wider text-muted-foreground mb-3">
              {t('items_to_refund')}
            </h3>
            <ScrollArea className="max-h-[220px]">
              <div className="space-y-2">
                {sale.items.map((item) => (
                  <div
                    key={item.productId}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      selectedItems[item.productId]
                        ? 'border-orange-300 bg-orange-50/50 dark:border-orange-700 dark:bg-orange-950/10'
                        : 'border-border hover:border-muted-foreground/30'
                    }`}
                  >
                    <Checkbox
                      checked={selectedItems[item.productId] || false}
                      onCheckedChange={(checked) =>
                        handleItemToggle(item.productId, checked === true)
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {currency}{item.unitPrice} × {item.quantity} {item.unit} = {currency}{item.totalPrice.toLocaleString()}
                      </p>
                    </div>
                    {selectedItems[item.productId] && (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {t('refund_quantity')}:
                        </span>
                        <Input
                          type="number"
                          min={1}
                          max={item.quantity}
                          value={refundQuantities[item.productId] || 0}
                          onChange={(e) =>
                            handleQuantityChange(item.productId, parseInt(e.target.value) || 0)
                          }
                          className="w-16 h-8 text-center text-sm"
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {t('max_quantity', { max: item.quantity })}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {!hasSelectedItems && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('select_at_least_one')}
            </p>
          )}

          <Separator />

          {/* Refund Method */}
          <div>
            <h3 className="font-medium text-sm uppercase tracking-wider text-muted-foreground mb-3">
              {t('refund_method')}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRefundMethod('নগদ')}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                  refundMethod === 'নগদ'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                    : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <div className={`rounded-full p-2 ${
                  refundMethod === 'নগদ' ? 'bg-emerald-100 dark:bg-emerald-900' : 'bg-muted'
                }`}>
                  <Package className={`h-4 w-4 ${
                    refundMethod === 'নগদ' ? 'text-emerald-600' : 'text-muted-foreground'
                  }`} />
                </div>
                <div className="text-left">
                  <p className="font-medium text-sm">{t('cash_refund')}</p>
                  <p className="text-xs text-muted-foreground">নগদে ফেরত</p>
                </div>
                {refundMethod === 'নগদ' && (
                  <CheckCircle className="h-4 w-4 text-emerald-600 ml-auto" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setRefundMethod('বাকি')}
                disabled={!sale.customerId}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                  refundMethod === 'বাকি'
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20'
                    : 'border-border hover:border-muted-foreground/30'
                } ${!sale.customerId ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`rounded-full p-2 ${
                  refundMethod === 'বাকি' ? 'bg-orange-100 dark:bg-orange-900' : 'bg-muted'
                }`}>
                  <Wallet className={`h-4 w-4 ${
                    refundMethod === 'বাকি' ? 'text-orange-600' : 'text-muted-foreground'
                  }`} />
                </div>
                <div className="text-left">
                  <p className="font-medium text-sm">{t('reduce_due')}</p>
                  <p className="text-xs text-muted-foreground">
                    {sale.customerId ? 'ক্রেতার বাকি কমাবে' : 'ক্রেতা নেই'}
                  </p>
                </div>
                {refundMethod === 'বাকি' && (
                  <CheckCircle className="h-4 w-4 text-orange-600 ml-auto" />
                )}
              </button>
            </div>
          </div>

          <Separator />

          {/* Refund Amount Summary */}
          <div className="bg-destructive/5 p-4 rounded-lg border border-destructive/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('refund_amount')}</p>
                <p className="text-2xl font-bold text-destructive">{currency}{refundAmount.toLocaleString()}</p>
              </div>
              <div className="text-right text-sm">
                <div className="flex items-center gap-1 text-emerald-600">
                  <Package className="h-3.5 w-3.5" />
                  {t('stock_restored')}
                </div>
                {refundMethod === 'বাকি' && sale.customerId && (
                  <div className="flex items-center gap-1 text-orange-600 mt-1">
                    <Wallet className="h-3.5 w-3.5" />
                    {t('due_reduced')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {showConfirm && (
          <div className="bg-orange-50 dark:bg-orange-950/20 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">{t('refund_confirm_message')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  ইনভয়েস: {sale.invoiceNumber} | পরিমাণ: {currency}{refundAmount.toLocaleString()} | পদ্ধতি: {refundMethod === 'নগদ' ? t('cash_refund') : t('reduce_due')}
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {tc('cancel')}
          </Button>
          {showConfirm ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
              >
                ফিরে যান
              </Button>
              <Button
                className="bg-orange-600 hover:bg-orange-700 text-white"
                onClick={handleConfirmRefund}
                disabled={submitting}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t('confirm_refund')}
              </Button>
            </div>
          ) : (
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => setShowConfirm(true)}
              disabled={!hasSelectedItems || submitting}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {t('title')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
