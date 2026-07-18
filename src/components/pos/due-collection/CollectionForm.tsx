'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Phone,
  User,
  ArrowLeft,
  Loader2,
  Wallet,
  Banknote,
  Smartphone,
  Sparkles,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { convertBengaliToEnglishNumerals } from '@/lib/utils';
import { toMoneyNumber } from '@/lib/money';
import type { DueCustomer, PayMethod } from './types';
import { QUICK_AMOUNTS } from './types';
import { daysSince } from './utils';

export interface CollectionFormProps {
  customer: DueCustomer;
  collectAmount: string;
  setCollectAmount: (v: string) => void;
  paymentMethod: PayMethod;
  setPaymentMethod: (m: PayMethod) => void;
  cashAmount: string;
  setCashAmount: (v: string) => void;
  upiAmount: string;
  setUpiAmount: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  amountInputRef: React.RefObject<HTMLInputElement | null>;
  parsedAmount: number;
  showConfirm: boolean;
  setShowConfirm: (v: boolean) => void;
  submitting: boolean;
  currencySymbol: string;
  formatTaka: (n: number) => string;
  formatStringNumbers: (n: string | number) => string;
  onBack: () => void;
  onSetFullAmount: () => void;
  onSetHalfAmount: () => void;
  onSetAmount: (amt: number) => void;
  onSubmit: () => void;
  onConfirm: () => void;
}

export function CollectionForm({
  customer,
  collectAmount,
  setCollectAmount,
  paymentMethod,
  setPaymentMethod,
  cashAmount,
  setCashAmount,
  upiAmount,
  setUpiAmount,
  notes,
  setNotes,
  amountInputRef,
  parsedAmount,
  showConfirm,
  setShowConfirm,
  submitting,
  currencySymbol,
  formatTaka,
  formatStringNumbers,
  onBack,
  onSetFullAmount,
  onSetHalfAmount,
  onSetAmount,
  onSubmit,
  onConfirm,
}: CollectionFormProps) {
  const t = useTranslations('DueCollection');
  const tc = useTranslations('Common');

  const amount = parsedAmount;
  const remaining = toMoneyNumber(customer.dueAmount - amount);
  const isValid = amount > 0 && amount <= customer.dueAmount + 0.001;
  const ageDays = daysSince(customer.lastPaymentDate);

  return (
    <div className="flex-1 overflow-y-auto w-full h-full pb-8">
      <div className="space-y-4 p-4 md:p-6 max-w-2xl mx-auto animate-in slide-in-from-right-2 duration-300">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="shrink-0 h-11 w-11"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{t('collect_amount')}</h1>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
        </div>

        <Card className="border-orange-200 dark:border-orange-900 bg-gradient-to-r from-orange-50/50 to-transparent dark:from-orange-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                <User className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg truncate">{customer.name}</h3>
                {customer.phone && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {customer.phone}
                  </p>
                )}
                {ageDays !== null && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    {t('last_payment')}: {ageDays === 0 ? t('today') || 'Today' : `${ageDays}d`}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">{t('due_amount')}</p>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                  {formatTaka(customer.dueAmount)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <Label className="text-sm font-medium">{t('collect_amount')}</Label>
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">
                  {currencySymbol}
                </span>
                <Input
                  ref={amountInputRef}
                  type="text"
                  inputMode="decimal"
                  value={collectAmount}
                  onChange={(e) =>
                    setCollectAmount(convertBengaliToEnglishNumerals(e.target.value).replace(/[^0-9.]/g, ''))
                  }
                  placeholder={t('enter_amount')}
                  className="pl-9 text-2xl font-bold h-14"
                  readOnly={paymentMethod === 'Mixed'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isValid) onSubmit();
                  }}
                />
              </div>
            </div>

            {/* Full / half */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 gap-1.5 h-10" onClick={onSetFullAmount}>
                <Wallet className="h-3.5 w-3.5" />
                {t('collect_full')}
              </Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1.5 h-10" onClick={onSetHalfAmount}>
                {t('collect_half')}
              </Button>
            </div>

            {/* Quick cash chips */}
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.filter((q) => q <= customer.dueAmount).map((q) => (
                <Button
                  key={q}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 px-3 tabular-nums"
                  onClick={() => onSetAmount(q)}
                >
                  {currencySymbol}{formatStringNumbers(q)}
                </Button>
              ))}
            </div>

            {amount > 0 && isValid && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <span className="text-sm text-muted-foreground">{t('remaining_due')}</span>
                <span className={`font-bold tabular-nums ${remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {formatTaka(remaining)}
                </span>
              </div>
            )}

            {amount > customer.dueAmount && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t('amount_exceeds')}
              </div>
            )}

            <Separator />

            <div>
              <Label className="text-sm font-medium">{t('payment_method')}</Label>
              <div className="flex gap-2 mt-1.5">
                {(
                  [
                    { id: 'Cash' as const, icon: Banknote, label: t('cash') },
                    { id: 'UPI' as const, icon: Smartphone, label: t('upi') },
                    { id: 'Mixed' as const, icon: Sparkles, label: t('mixed') },
                  ] as const
                ).map(({ id, icon: Icon, label }) => (
                  <Button
                    key={id}
                    variant={paymentMethod === id ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 gap-1.5 h-11"
                    onClick={() => {
                      setPaymentMethod(id);
                      if (id === 'Mixed') {
                        setCashAmount('');
                        setUpiAmount('');
                      }
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {paymentMethod === 'Mixed' && (
              <div className="grid grid-cols-2 gap-3 mt-1">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{t('cash')}</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={cashAmount}
                    onChange={(e) =>
                      setCashAmount(convertBengaliToEnglishNumerals(e.target.value).replace(/[^0-9.]/g, ''))
                    }
                    placeholder={t('cash')}
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{t('upi')}</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={upiAmount}
                    onChange={(e) =>
                      setUpiAmount(convertBengaliToEnglishNumerals(e.target.value).replace(/[^0-9.]/g, ''))
                    }
                    placeholder={t('upi')}
                    className="h-11"
                  />
                </div>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium">{t('notes')}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('notes_placeholder')}
                className="mt-1.5 resize-none"
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        <Button
          className="w-full h-14 text-lg font-bold shadow-lg bg-orange-600 hover:bg-orange-700"
          disabled={!isValid || submitting}
          onClick={onSubmit}
        >
          {isValid ? formatTaka(amount) : formatTaka(0)} · {t('collect')}
        </Button>

        <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
          <DialogContent className="max-w-sm w-[95vw] max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                {t('confirm_collection')}
              </DialogTitle>
              <DialogDescription>
                {t('confirm_message', { amount: formatTaka(amount) })}
              </DialogDescription>
            </DialogHeader>
            <div className="p-3 rounded-xl bg-muted/50 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{tc('name')}</span>
                <span className="font-medium">{customer.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('due_amount')}</span>
                <span className="font-medium text-orange-600 tabular-nums">
                  {formatTaka(customer.dueAmount)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('collect_amount')}</span>
                <span className="font-bold text-green-600 tabular-nums">{formatTaka(amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('payment_method')}</span>
                <span className="font-medium">
                  {paymentMethod === 'Cash' ? t('cash') : paymentMethod === 'UPI' ? t('upi') : t('mixed')}
                </span>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={submitting}>
                {tc('cancel')}
              </Button>
              <Button
                onClick={onConfirm}
                disabled={submitting}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t('collect')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
