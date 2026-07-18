'use client';

import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Calculator,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wallet,
} from 'lucide-react';
import type { Customer } from '@/types/pos';
import { cn, convertBengaliToEnglishNumerals } from '@/lib/utils';
import { toMoneyNumber } from '@/lib/money';
import { QUICK_AMOUNTS } from './types';

interface CartLineItem {
  id: string;
  productName: string;
  quantity: number;
  unit?: string;
  totalPrice: number;
}

interface CheckoutFormProps {
  items: CartLineItem[];
  displayedCustomerName?: string | null;
  paymentMethod: string;
  paymentMethodIcon: React.ReactNode;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  customer?: Customer | null;
  customerId?: string | null;
  usePrepaid: boolean;
  setUsePrepaid: (v: boolean) => void;
  prepaidAmountToUse: number;
  remainingTotal: number;
  currencySymbol: string;
  cashReceived: string;
  upiReceived: string;
  amountReceived: string;
  handleCashChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleUpiChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleQuickAmount: (amount: number) => void;
  isProcessing: boolean;
  parsedAmount: number;
  change: number;
  debtRepaymentAmount: string;
  setDebtRepaymentAmount: (v: string) => void;
  prepaymentAmount: string;
  setPrepaymentAmount: (v: string) => void;
  setInputError: (v: string | null) => void;
  inputError: string | null;
  isValidPayment: boolean;
  onCancel: () => void;
  onComplete: () => void;
  formatPrice: (n: number) => string;
  formatStringNumbers: (n: number | string) => string;
  t: (key: string, values?: any) => string;
  tc: (key: string, values?: any) => string;
}

export function CheckoutForm({
  items,
  displayedCustomerName,
  paymentMethod,
  paymentMethodIcon,
  subtotal,
  discount,
  tax,
  total,
  customer,
  customerId,
  usePrepaid,
  setUsePrepaid,
  prepaidAmountToUse,
  remainingTotal,
  currencySymbol,
  cashReceived,
  upiReceived,
  amountReceived,
  handleCashChange,
  handleUpiChange,
  handleAmountChange,
  handleQuickAmount,
  isProcessing,
  parsedAmount,
  change,
  debtRepaymentAmount,
  setDebtRepaymentAmount,
  prepaymentAmount,
  setPrepaymentAmount,
  setInputError,
  inputError,
  isValidPayment,
  onCancel,
  onComplete,
  formatPrice,
  formatStringNumbers,
  t,
  tc,
}: CheckoutFormProps) {
  return (
    <>
      <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 flex-none border-b">
        <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Calculator className="w-5 h-5" />
          {t('title')}
        </DialogTitle>
        <DialogDescription>{t('review_order')}</DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain px-4 sm:px-6 py-3 sm:py-4 space-y-4">
        {displayedCustomerName && (
          <div className="flex items-center flex-wrap gap-1.5 text-sm bg-muted p-2 rounded-lg w-full overflow-hidden">
            <Badge variant="secondary" className="max-w-full truncate">{displayedCustomerName}</Badge>
            {paymentMethod === 'Due' && <Badge variant="outline" className="text-amber-600 shrink-0">{t('due_payment_label')}</Badge>}
          </div>
        )}

        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="truncate flex-1">{item.productName}<span className="text-muted-foreground ml-1">×{item.quantity}{item.unit ? ` ${item.unit}` : ''}</span></span>
              <span className="font-medium ml-2">{formatPrice(item.totalPrice)}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1.5 border-t pt-4">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('subtotal')}</span><span>{formatPrice(subtotal)}</span></div>
          {discount > 0 && <div className="flex justify-between text-sm text-green-600"><span>{t('discount')}</span><span>-{formatPrice(discount)}</span></div>}
          {tax > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('tax')}</span><span>{formatPrice(tax)}</span></div>}
          <Separator className="my-2" />
          <div className="flex justify-between font-semibold text-lg"><span>{t('total')}</span><span className="text-primary">{formatPrice(total)}</span></div>
        </div>

        {customer && toMoneyNumber(customer.prepaidBalance) > 0 && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="use-prepaid" className="font-medium flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-green-600" />
                  {t('use_prepaid')}
                </Label>
                <p className="text-xs text-muted-foreground">{t('available')}: {formatPrice(customer.prepaidBalance)}</p>
              </div>
              <Switch id="use-prepaid" checked={usePrepaid} onCheckedChange={setUsePrepaid} />
            </div>
            {usePrepaid && (
              <p className="text-sm text-green-700 font-medium text-center pt-1">
                {t('prepaid_applied', { amount: formatPrice(prepaidAmountToUse) })}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">{t('payment_method')}</span>
          <Badge variant="secondary" className="gap-1 px-2 py-1">
            {paymentMethodIcon}
            {remainingTotal === 0 ? t('prepaid') : (
              paymentMethod === 'Cash' ? t('cash') :
              paymentMethod === 'UPI' ? t('upi') :
              paymentMethod === 'Mixed' ? t('mixed_payment') :
              paymentMethod === 'Due' ? t('due') : paymentMethod
            )}
          </Badge>
        </div>

        {remainingTotal > 0 && paymentMethod !== 'Due' && (
          <div className="space-y-3">
            <Label htmlFor="amount-received">{t('amount_to_pay')}</Label>

            {paymentMethod === 'Mixed' ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">{t('cash')}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currencySymbol}</span>
                    <Input
                      id="cash-received"
                      type="text"
                      inputMode="numeric"
                      value={cashReceived}
                      onChange={handleCashChange}
                      placeholder="0"
                      className="pl-8 text-xl h-12 font-semibold text-right"
                      disabled={isProcessing}
                      readOnly
                      onFocus={e => e.currentTarget.removeAttribute('readonly')}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">{t('upi')}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currencySymbol}</span>
                    <Input
                      id="upi-received"
                      type="text"
                      inputMode="numeric"
                      value={upiReceived}
                      onChange={handleUpiChange}
                      placeholder="0"
                      className="pl-8 text-xl h-12 font-semibold text-right"
                      disabled={isProcessing}
                      readOnly
                      onFocus={e => e.currentTarget.removeAttribute('readonly')}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currencySymbol}</span>
                <Input
                  id="amount-received"
                  type="text"
                  inputMode="numeric"
                  value={amountReceived}
                  onChange={handleAmountChange}
                  placeholder="0"
                  className="pl-8 text-xl h-12 font-semibold text-right"
                  disabled={isProcessing}
                  readOnly
                  onFocus={e => e.currentTarget.removeAttribute('readonly')}
                />
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 md:hidden">
              {QUICK_AMOUNTS.map((amount) => (
                <Button key={amount} variant="outline" size="sm" onClick={() => handleQuickAmount(amount)} disabled={isProcessing} className="h-11 text-sm font-semibold touch-manipulation tabular-nums">{currencySymbol}{formatStringNumbers(amount)}</Button>
              ))}
            </div>

            {parsedAmount > 0 && (
              <div className={cn('p-3 rounded-lg text-center', change >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
                {change >= 0 ? (
                  <><p className="text-sm">{t('change')}</p><p className="text-xl font-bold">{formatPrice(change)}</p></>
                ) : (
                  <><p className="text-sm flex items-center justify-center gap-1"><AlertCircle className="w-4 h-4" />{t('balance_due')}</p><p className="text-xl font-bold">{formatPrice(Math.abs(change))}</p></>
                )}
              </div>
            )}

            {change > 0 && customerId && (
              <div className="space-y-3 mt-4 p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
                <p className="text-sm font-medium text-blue-900">{t('allocate_change') || 'Allocate Change'} ({formatPrice(change)})</p>

                {customer && toMoneyNumber(customer.totalDue) > 0 && (
                  <div className="flex items-center gap-2">
                    <Label className="flex-1 text-sm">{t('clear_due') || 'Clear Due'} ({tc('max') || 'Max'} {formatPrice(Math.min(change, toMoneyNumber(customer.totalDue)))})</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={debtRepaymentAmount}
                      onChange={(e) => {
                        const val = convertBengaliToEnglishNumerals(e.target.value);
                        if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                          setDebtRepaymentAmount(val);
                          setInputError(null);
                        }
                      }}
                      className="w-28 text-right bg-white"
                      placeholder="0"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Label className="flex-1 text-sm">{t('add_prepayment') || 'Add to Prepayment'}</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={prepaymentAmount}
                    onChange={(e) => {
                      const val = convertBengaliToEnglishNumerals(e.target.value);
                      if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                        setPrepaymentAmount(val);
                        setInputError(null);
                      }
                    }}
                    className="w-28 text-right bg-white"
                    placeholder="0"
                  />
                </div>

                <div className="text-sm text-right font-medium text-blue-800 pt-1 border-t border-blue-200">
                  {t('return_to_customer', { amount: formatPrice(Math.max(0, change - (Number(debtRepaymentAmount) || 0) - (Number(prepaymentAmount) || 0))) })}
                </div>
              </div>
            )}

            {change > 0 && !customerId && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-center">
                <p className="text-sm text-green-700 font-medium">{t('return_to_customer', { amount: formatPrice(change) })}</p>
              </div>
            )}
          </div>
        )}

        {inputError && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="w-4 h-4" />{inputError}</p>}

        {paymentMethod === 'Due' && remainingTotal > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-700 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {t('due_balance_info', { amount: formatPrice(remainingTotal) })}
            </p>
          </div>
        )}
      </div>

      <DialogFooter className="px-4 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6 pt-3 sm:pt-4 flex-none border-t bg-background gap-2 sm:gap-0">
        <Button variant="outline" className="h-11 sm:h-9 touch-manipulation" onClick={onCancel}>{tc('cancel')}</Button>
        <Button
          onClick={onComplete}
          disabled={!isValidPayment}
          className="min-w-30 h-11 sm:h-9 bg-blue-600 text-white hover:bg-blue-700 touch-manipulation"
        >
          <CheckCircle2 className="w-4 h-4 mr-2" />{t('complete_sale')}
        </Button>
      </DialogFooter>
    </>
  );
}
