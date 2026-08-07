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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Loader2,
  ShoppingBag,
} from 'lucide-react';
import type { Customer, LedgerEntry } from '@/types/pos';
import { cn, convertBengaliToEnglishNumerals } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import type { CustomerPurchaseDetail } from './types';

interface CustomerLedgerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  ledgerEntries: LedgerEntry[];
  formatPrice: (value: number | string | null | undefined) => string;
  formatDate: (value: string | Date) => string;
}

export function CustomerLedgerDialog({
  open,
  onOpenChange,
  customer,
  ledgerEntries,
  formatPrice,
  formatDate,
}: CustomerLedgerDialogProps) {
  const t = useTranslations('Parties');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-2xl w-[95vw] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {t('ledger_title') || 'Ledger'} - {customer?.name}
          </DialogTitle>
          <DialogDescription>
            {t('transaction_history') || 'Transaction history and due balance'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t('current_due') || 'Current Due'}</span>
                <span className="text-2xl font-bold text-red-600">
                  {formatPrice(customer?.totalDue || 0)}
                </span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-muted-foreground">{t('prepaid_balance') || 'Prepaid Balance'}</span>
                <span className="text-2xl font-bold text-green-600">
                  {formatPrice(customer?.prepaidBalance || 0)}
                </span>
              </div>
            </CardContent>
          </Card>

          <ScrollArea className="h-75">
            <div className="space-y-2 pr-2">
              {ledgerEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    entry.entryType === 'credit' ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      entry.entryType === 'credit' ? 'bg-red-100' : 'bg-green-100'
                    )}>
                      {entry.entryType === 'credit' ? (
                        <ArrowUpRight className="w-4 h-4 text-red-600" />
                      ) : (
                        <ArrowDownRight className="w-4 h-4 text-green-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{entry.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(entry.createdAt)} • {entry.referenceId}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "font-semibold",
                      entry.entryType === 'credit' ? 'text-red-600' : 'text-green-600'
                    )}>
                      {entry.entryType === 'credit' ? '+' : '-'}{formatPrice(entry.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Bal: {formatPrice(entry.balanceAfter)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CustomerPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  paymentAmount: string;
  setPaymentAmount: (value: string) => void;
  paymentMethod: string;
  setPaymentMethod: (value: string) => void;
  cashAmount: string;
  setCashAmount: (value: string) => void;
  upiAmount: string;
  setUpiAmount: (value: string) => void;
  parsedPaymentAmount: number;
  isMixedOk: boolean;
  isSubmitting: boolean;
  currencySymbol: string;
  formatPrice: (value: number | string | null | undefined) => string;
  onSubmit: () => void;
}

export function CustomerPaymentDialog({
  open,
  onOpenChange,
  customer,
  paymentAmount,
  setPaymentAmount,
  paymentMethod,
  setPaymentMethod,
  cashAmount,
  setCashAmount,
  upiAmount,
  setUpiAmount,
  parsedPaymentAmount,
  isMixedOk,
  isSubmitting,
  currencySymbol,
  formatPrice,
  onSubmit,
}: CustomerPaymentDialogProps) {
  const t = useTranslations('Parties');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm w-[95vw] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('record_payment') || 'পেমেন্ট রেকর্ড করুন'}</DialogTitle>
          <DialogDescription>
            {customer?.name} থেকে পেমেন্ট রেকর্ড করুন
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('current_due') || 'বর্তমান বকেয়া'}</span>
              <span className="font-bold text-red-600">
                {formatPrice(customer?.totalDue || 0)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-dialog-amount">{t('payment_amount') || 'পেমেন্টের পরিমাণ'}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currencySymbol}</span>
              <Input
                id="payment-dialog-amount"
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
            {customer && parsedPaymentAmount > customer.totalDue && (
              <p className="text-xs text-destructive font-medium mt-1">
                {t('repay_amount_exceeds', { max: formatPrice(customer.totalDue) })}
              </p>
            )}
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
                <SelectItem value="Cash">{t('cash') || 'নগদ'}</SelectItem>
                <SelectItem value="UPI">{t('upi') || 'ইউপিআই'}</SelectItem>
                <SelectItem value="Mixed">{t('mixed') || 'মিশ্র'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {paymentMethod === 'Mixed' && (() => {
            const totalAmt = parseFloat(convertBengaliToEnglishNumerals(paymentAmount)) || 0;
            const cashVal = parseFloat(cashAmount) || 0;
            const upiVal = parseFloat(upiAmount) || 0;
            const mixedSum = cashVal + upiVal;
            const mixedOk = Math.abs(mixedSum - totalAmt) < 0.01;
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
                <div className={`text-xs px-2 py-1.5 rounded-lg flex items-center justify-between ${mixedOk ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'}`}>
                  <span>নগদ {cashVal} + ইউপিআই {upiVal}</span>
                  <span className="font-semibold">{mixedOk ? '✓ মিলেছে' : `বাকি: ${formatPrice(Math.abs(totalAmt - mixedSum))}`}</span>
                </div>
              </div>
            );
          })()}

          <div className="flex flex-wrap gap-2">
            {[100, 200, 500, 1000].map((amount) => (
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
              onClick={() => setPaymentAmount((customer?.totalDue || 0).toString())}
            >
              {t('full_amount') || 'সম্পূর্ণ পরিমাণ'}
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('cancel') || 'বাতিল'}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!paymentAmount || parsedPaymentAmount <= 0 || (customer ? parsedPaymentAmount > customer.totalDue : false) || !isMixedOk || isSubmitting}
            className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('recording') || 'রেকর্ড করা হচ্ছে...'}
              </>
            ) : (
              t('record_payment_btn') || 'পেমেন্ট রেকর্ড করুন'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CustomerPrepaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  prepaymentAmount: string;
  setPrepaymentAmount: (value: string) => void;
  isSubmitting: boolean;
  currencySymbol: string;
  formatPrice: (value: number | string | null | undefined) => string;
  onSubmit: () => void;
}

export function CustomerPrepaymentDialog({
  open,
  onOpenChange,
  customer,
  prepaymentAmount,
  setPrepaymentAmount,
  isSubmitting,
  currencySymbol,
  formatPrice,
  onSubmit,
}: CustomerPrepaymentDialogProps) {
  const t = useTranslations('Parties');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm w-[95vw] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('add_prepayment') || 'আগাম জমা দিন'}</DialogTitle>
          <DialogDescription>
            {customer?.name} এর জন্য আগাম জমা যোগ করুন
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('current_prepaid_balance') || 'বর্তমান আগাম জমা'}</span>
              <span className="font-bold text-green-600">
                {formatPrice(customer?.prepaidBalance || 0)}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prepayment-dialog-amount">{t('amount_to_add') || 'জমার পরিমাণ'}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currencySymbol}</span>
              <Input
                id="prepayment-dialog-amount"
                type="text"
                value={prepaymentAmount}
                onChange={(e) => {
                  const val = convertBengaliToEnglishNumerals(e.target.value);
                  const cleaned = val.replace(/[^0-9.]/g, '');
                  const dotCount = (cleaned.match(/\./g) || []).length;
                  if (dotCount > 1) return;
                  setPrepaymentAmount(cleaned);
                }}
                placeholder="0"
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[100, 200, 500, 1000].map((amount) => (
              <Button
                key={amount}
                variant="outline"
                size="sm"
                onClick={() => setPrepaymentAmount(amount.toString())}
              >
                {formatPrice(amount)}
              </Button>
            ))}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('cancel') || 'বাতিল'}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!prepaymentAmount || parseFloat(prepaymentAmount) <= 0 || isSubmitting}
            className="bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('adding') || 'যোগ করা হচ্ছে...'}
              </>
            ) : (
              t('add_prepayment_btn') || 'আগাম জমা দিন'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CustomerWithdrawDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  withdrawAmount: string;
  setWithdrawAmount: (value: string) => void;
  isSubmitting: boolean;
  currencySymbol: string;
  formatPrice: (value: number | string | null | undefined) => string;
  onSubmit: () => void;
}

export function CustomerWithdrawDialog({
  open,
  onOpenChange,
  customer,
  withdrawAmount,
  setWithdrawAmount,
  isSubmitting,
  currencySymbol,
  formatPrice,
  onSubmit,
}: CustomerWithdrawDialogProps) {
  const t = useTranslations('Parties');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm w-[95vw] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('withdraw_prepaid_balance') || 'আগাম জমা উত্তোলন করুন'}</DialogTitle>
          <DialogDescription>
            {customer?.name} এর আগাম জমা থেকে নগদ উত্তোলন করুন
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('available_balance') || 'উপলব্ধ ব্যালেন্স'}</span>
              <span className="font-bold text-green-600">
                {formatPrice(customer?.prepaidBalance || 0)}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="withdraw-amount">{t('amount_to_withdraw') || 'উত্তোলনের পরিমাণ'}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currencySymbol}</span>
              <Input
                id="withdraw-amount"
                type="text"
                value={withdrawAmount}
                onChange={(e) => {
                  const val = convertBengaliToEnglishNumerals(e.target.value);
                  const cleaned = val.replace(/[^0-9.]/g, '');
                  const dotCount = (cleaned.match(/\./g) || []).length;
                  if (dotCount > 1) return;
                  setWithdrawAmount(cleaned);
                }}
                placeholder="0"
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[100, 200, 500, 1000].map((amount) => (
              <Button key={amount} variant="outline" size="sm" onClick={() => setWithdrawAmount(amount.toString())}>{formatPrice(amount)}</Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => setWithdrawAmount((customer?.prepaidBalance || 0).toString())}>{t('full_balance') || 'সম্পূর্ণ ব্যালেন্স'}</Button>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>{t('cancel') || 'বাতিল'}</Button>
          <Button
            onClick={onSubmit}
            disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > (customer?.prepaidBalance || 0) || isSubmitting}
            className="bg-orange-600 text-white hover:bg-orange-700"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('withdrawing') || 'উত্তোলন করা হচ্ছে...'}
              </>
            ) : (
              t('withdraw_btn') || 'উত্তোলন করুন'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CustomerDueEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  amount: string;
  setAmount: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  isSubmitting: boolean;
  currencySymbol: string;
  onSubmit: () => void;
}

export function CustomerDueEntryDialog({
  open,
  onOpenChange,
  customer,
  amount,
  setAmount,
  description,
  setDescription,
  isSubmitting,
  currencySymbol,
  onSubmit,
}: CustomerDueEntryDialogProps) {
  const t = useTranslations('Parties');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm w-[95vw] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('due_entry_title') || 'ম্যানুয়াল বাকি এন্ট্রি'}</DialogTitle>
          <DialogDescription>
            {t('due_entry_desc', { name: customer?.name || '' }) || `${customer?.name || ''} এর জন্য ম্যানুয়াল বাকি এন্ট্রি রেকর্ড করুন`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="due-entry-amount">{t('due_entry_amount') || 'বাকির পরিমাণ'}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currencySymbol}</span>
              <Input
                id="due-entry-amount"
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
            <Label htmlFor="due-entry-description">{t('notes_label') || 'নোট'}</Label>
            <Textarea
              id="due-entry-description"
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
              t('due_entry') || 'বাকি এন্ট্রি'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CustomerDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  customerPhone: string;
  detail: CustomerPurchaseDetail | null;
  loading: boolean;
  formatPrice: (value: number | string | null | undefined) => string;
  formatNumber: (value: number | string) => string;
}

export function CustomerDetailsDialog({
  open,
  onOpenChange,
  customerName,
  customerPhone,
  detail,
  loading,
  formatPrice,
  formatNumber,
}: CustomerDetailsDialogProps) {
  const t = useTranslations('Parties');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-indigo-600" />
            <span>{customerName}</span>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1">
            {customerPhone && <span>{customerPhone}</span>}
            <span className="text-[10px] text-muted-foreground ml-auto">{t('last_1_year_data') || 'গত ১ বছরের তথ্য'}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span>{t('loading') || 'লোড হচ্ছে...'}</span>
          </div>
        ) : !detail || (detail.orderCount === 0 && !detail.topProducts?.length) ? (
          <div className="py-10 text-center text-xs text-muted-foreground">
            <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>{t('no_purchase_data') || 'কোনো কেনাকাটার তথ্য পাওয়া যায়নি।'}</p>
            <p className="text-[10px] mt-1">{t('no_purchase_yet') || 'এই গ্রাহক এখনো কোনো কেনাকাটা করেননি।'}</p>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-indigo-50 dark:bg-indigo-950/20 rounded-xl p-3 text-center border border-indigo-100 dark:border-indigo-900/30">
                <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider mb-0.5">{t('total_spent') || 'মোট কেনাকাটা'}</p>
                <p className="text-sm font-extrabold text-indigo-700 dark:text-indigo-300">{formatPrice(detail.totalSpent ?? 0)}</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3 text-center border border-border/40">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">{t('orders') || 'অর্ডার সংখ্যা'}</p>
                <p className="text-sm font-extrabold">{formatNumber(detail.orderCount ?? 0)}</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3 text-center border border-border/40">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">{t('avg_order') || 'গড় মূল্য'}</p>
                <p className="text-sm font-extrabold">{formatPrice(detail.aov ?? 0)}</p>
              </div>
            </div>

            {detail.topProducts && detail.topProducts.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-4 bg-indigo-500 rounded-full inline-block"></span>
                  {t('top_products_label') || 'শীর্ষ ক্রয়কৃত পণ্য'}
                </p>
                <div className="rounded-lg overflow-hidden border border-border/50">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-[10px] py-1.5 font-bold">{t('product_name') || 'পণ্যের নাম'}</TableHead>
                        <TableHead className="text-right text-[10px] py-1.5 font-bold">{t('qty') || 'পরিমাণ'}</TableHead>
                        <TableHead className="text-right text-[10px] py-1.5 font-bold">{t('total_price') || 'মোট মূল্য'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.topProducts.map((p, idx) => (
                        <TableRow key={p.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                          <TableCell className="text-xs py-2">{p.name}</TableCell>
                          <TableCell className="text-right text-xs py-2 text-muted-foreground">{formatNumber(p.qty)}</TableCell>
                          <TableCell className="text-right text-xs py-2 font-semibold">{formatPrice(p.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {detail.categoryBreakdown && detail.categoryBreakdown.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-4 bg-emerald-500 rounded-full inline-block"></span>
                  {t('category_breakdown') || 'ক্যাটেগরি অনুযায়ী খরচ'}
                </p>
                <div className="space-y-1.5">
                  {[...detail.categoryBreakdown]
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 5)
                    .map((cat) => {
                      const pct = (detail.totalSpent || 0) > 0 ? (cat.value / (detail.totalSpent || 0)) * 100 : 0;
                      return (
                        <div key={cat.name} className="flex items-center gap-2">
                          <p className="text-[10px] text-muted-foreground w-24 shrink-0 truncate">{cat.name}</p>
                          <div className="flex-1 bg-muted/50 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-[10px] font-semibold w-16 text-right shrink-0">{formatPrice(cat.value)}</p>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {detail.monthlyTrend && detail.monthlyTrend.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-4 bg-blue-500 rounded-full inline-block"></span>
                  {t('monthly_purchases') || 'মাসওয়ারি কেনাকাটা'}
                </p>
                <div className="rounded-lg overflow-hidden border border-border/50">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-[10px] py-1.5 font-bold">{t('month') || 'মাস'}</TableHead>
                        <TableHead className="text-right text-[10px] py-1.5 font-bold">{t('total_expense') || 'মোট খরচ'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...detail.monthlyTrend].reverse().map((m, idx) => (
                        <TableRow key={m.month} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                          <TableCell className="text-xs py-1.5 text-muted-foreground">{m.month}</TableCell>
                          <TableCell className="text-right text-xs py-1.5 font-semibold">{formatPrice(m.spent)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
