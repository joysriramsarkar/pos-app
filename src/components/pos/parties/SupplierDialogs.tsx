'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Loader2,
} from 'lucide-react';
import type { Supplier } from '@/types/pos';
import { cn, convertBengaliToEnglishNumerals } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import type { SupplierWithBalances } from './types';

interface SupplierLedgerEntry {
  id: string;
  entryType: string;
  description?: string;
  createdAt: string | Date;
  referenceId?: string;
  amount: number;
  balanceAfter: number;
}

interface SupplierLedgerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
  ledgerEntries: SupplierLedgerEntry[];
  formatPrice: (value: number | string | null | undefined) => string;
  formatDate: (value: string | Date) => string;
}

export function SupplierLedgerDialog({
  open,
  onOpenChange,
  supplier,
  ledgerEntries,
  formatPrice,
  formatDate,
}: SupplierLedgerDialogProps) {
  const s = supplier as SupplierWithBalances | null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-2xl w-[95vw] max-h-[90dvh] flex flex-col overflow-hidden p-0">
        <div className="flex-shrink-0 px-4 pt-5 sm:px-6 sm:pt-6 pb-3">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 min-w-0">
              <FileText className="w-5 h-5 shrink-0" />
              <span className="truncate">লেজার খাতা - {supplier?.name}</span>
            </DialogTitle>
            <DialogDescription>
              সাপ্লায়ারের লেনদেনের ইতিহাস ও বকেয়া খতিয়ান
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-5 sm:pb-6">
          <div className="space-y-4">
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-muted-foreground font-medium shrink-0">বর্তমান বকেয়া</span>
                  <span className="text-xl sm:text-2xl font-bold text-red-600 tabular-nums">
                    {formatPrice(s?.totalDue || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/40 text-sm gap-2">
                  <span className="text-muted-foreground truncate">মোট ক্রয়: {formatPrice(s?.totalPurchases || 0)}</span>
                  <span className="text-muted-foreground shrink-0">মোট পরিশোধ: {formatPrice(s?.totalPaid || 0)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {ledgerEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">কোনো লেনদেন পাওয়া যায়নি</p>
              ) : (
                ledgerEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={cn(
                      "flex items-center justify-between gap-2 p-3 rounded-lg border overflow-hidden",
                      entry.entryType === 'credit' ? 'bg-red-50 border-red-100 dark:bg-red-950/20 dark:border-red-900/30' : 'bg-green-50 border-green-100 dark:bg-green-950/20 dark:border-green-900/30'
                    )}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <div className={cn(
                        "w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0",
                        entry.entryType === 'credit' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'
                      )}>
                        {entry.entryType === 'credit' ? (
                          <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-xs sm:text-sm truncate">{entry.description}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {formatDate(entry.createdAt)} • {entry.referenceId}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn(
                        "font-semibold text-sm tabular-nums",
                        entry.entryType === 'credit' ? 'text-red-600' : 'text-green-600'
                      )}>
                        {entry.entryType === 'credit' ? '+' : '-'}{formatPrice(entry.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Bal: {formatPrice(entry.balanceAfter)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SupplierPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
  paymentAmount: string;
  setPaymentAmount: (value: string) => void;
  paymentMethod: string;
  setPaymentMethod: (value: string) => void;
  cashAmount: string;
  setCashAmount: (value: string) => void;
  upiAmount: string;
  setUpiAmount: (value: string) => void;
  isSubmitting: boolean;
  currencySymbol: string;
  formatPrice: (value: number | string | null | undefined) => string;
  onSubmit: () => void;
}

export function SupplierPaymentDialog({
  open,
  onOpenChange,
  supplier,
  paymentAmount,
  setPaymentAmount,
  paymentMethod,
  setPaymentMethod,
  cashAmount,
  setCashAmount,
  upiAmount,
  setUpiAmount,
  isSubmitting,
  currencySymbol,
  formatPrice,
  onSubmit,
}: SupplierPaymentDialogProps) {
  const s = supplier as SupplierWithBalances | null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm w-[95vw] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>টাকা পরিশোধ করুন</DialogTitle>
          <DialogDescription>
            {supplier?.name} এর বকেয়া পরিশোধের পেমেন্ট রেকর্ড
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">বর্তমান বকেয়া</span>
              <span className="font-bold text-red-600">
                {formatPrice(s?.totalDue || 0)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-payment-dialog-amount">পরিশোধের পরিমাণ</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currencySymbol}</span>
              <Input
                id="supplier-payment-dialog-amount"
                type="text"
                value={paymentAmount}
                onChange={(e) => {
                  const val = convertBengaliToEnglishNumerals(e.target.value);
                  const cleaned = val.replace(/[^0-9.]/g, '');
                  const dotCount = (cleaned.match(/\./g) || []).length;
                  if (dotCount > 1) return;
                  setPaymentAmount(cleaned);
                }}
                placeholder="0"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>পেমেন্ট পদ্ধতি</Label>
            <Select value={paymentMethod} onValueChange={(v) => {
              setPaymentMethod(v);
              if (v === 'Mixed' && paymentAmount) {
                const totalAmt = parseFloat(convertBengaliToEnglishNumerals(paymentAmount)) || 0;
                setCashAmount(totalAmt.toString());
                setUpiAmount('0');
              } else if (v !== 'Mixed') {
                setCashAmount('');
                setUpiAmount('');
              }
            }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash (নগদ)</SelectItem>
                <SelectItem value="UPI">UPI (ইউপিআই)</SelectItem>
                <SelectItem value="Mixed">Mixed (মিশ্র)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {paymentMethod === 'Mixed' && (() => {
            const totalAmt = parseFloat(convertBengaliToEnglishNumerals(paymentAmount)) || 0;
            const cashVal = parseFloat(cashAmount) || 0;
            const upiVal = parseFloat(upiAmount) || 0;
            const mixedSum = cashVal + upiVal;
            const isMixedOk = Math.abs(mixedSum - totalAmt) < 0.01;
            return (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">নগদ</Label>
                    <Input type="text" value={cashAmount} onChange={(e) => {
                      const val = convertBengaliToEnglishNumerals(e.target.value).replace(/[^0-9.]/g, '');
                      setCashAmount(val);
                      const cVal = parseFloat(val) || 0;
                      if (cVal <= totalAmt) setUpiAmount((totalAmt - cVal).toFixed(2).replace(/\.00$/, ''));
                      else setUpiAmount('0');
                    }} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">ইউপিআই</Label>
                    <Input type="text" value={upiAmount} onChange={(e) => {
                      const val = convertBengaliToEnglishNumerals(e.target.value).replace(/[^0-9.]/g, '');
                      setUpiAmount(val);
                      const uVal = parseFloat(val) || 0;
                      if (uVal <= totalAmt) setCashAmount((totalAmt - uVal).toFixed(2).replace(/\.00$/, ''));
                      else setCashAmount('0');
                    }} className="h-9" />
                  </div>
                </div>
                <div className={`text-xs px-2 py-1.5 rounded-lg flex items-center justify-between ${isMixedOk ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'}`}>
                  <span>নগদ {cashVal} + ইউপিআই {upiVal}</span>
                  <span className="font-semibold">{isMixedOk ? '✓ মিলেছে' : `বাকি: ${formatPrice(Math.abs(totalAmt - mixedSum))}`}</span>
                </div>
              </div>
            );
          })()}

          <div className="flex flex-wrap gap-2">
            {[500, 1000, 2000, 5000].map((amount) => (
              <Button
                key={amount}
                variant="outline"
                size="sm"
                onClick={() => setPaymentAmount(amount.toString())}
              >
                {formatPrice(amount)}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPaymentAmount((s?.totalDue || 0).toString())}
            >
              সম্পূর্ণ বকেয়া
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            বাতিল
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || isSubmitting}
            className="bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                রেকর্ড হচ্ছে...
              </>
            ) : (
              'পেমেন্ট রেকর্ড করুন'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SupplierDueEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
  amount: string;
  setAmount: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  isSubmitting: boolean;
  currencySymbol: string;
  onSubmit: () => void;
}

export function SupplierDueEntryDialog({
  open,
  onOpenChange,
  supplier,
  amount,
  setAmount,
  description,
  setDescription,
  isSubmitting,
  currencySymbol,
  onSubmit,
}: SupplierDueEntryDialogProps) {
  const t = useTranslations('Parties');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm w-[95vw] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>সাপ্লায়ার ম্যানুয়াল বাকি এন্ট্রি</DialogTitle>
          <DialogDescription>
            {supplier?.name || ''} এর জন্য ম্যানুয়াল বাকি এন্ট্রি রেকর্ড করুন
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="supplier-due-entry-amount">বাকির পরিমাণ</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currencySymbol}</span>
              <Input
                id="supplier-due-entry-amount"
                type="text"
                value={amount}
                onChange={(e) => {
                  const val = convertBengaliToEnglishNumerals(e.target.value);
                  const cleaned = val.replace(/[^0-9.]/g, '');
                  const dotCount = (cleaned.match(/\./g) || []).length;
                  if (dotCount > 1) return;
                  setAmount(cleaned);
                }}
                placeholder="0"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplier-due-entry-description">{t('notes_label') || 'নোট'}</Label>
            <Textarea
              id="supplier-due-entry-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('additional_notes') || 'অতিরিক্ত নোট...'}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('cancel') || 'বাতিল'}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!amount || parseFloat(amount) <= 0 || isSubmitting}
            className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-650"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                এন্ট্রি হচ্ছে...
              </>
            ) : (
              'বাকি এন্ট্রি'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
