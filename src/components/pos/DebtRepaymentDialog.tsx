'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { useSettingsStore } from '@/stores/settings-store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';
import { convertBengaliToEnglishNumerals } from '@/lib/utils';

interface DebtRepaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excessAmount: number;
  debtAmount: number;
  customerName: string;
  onConfirm: (repaymentAmount: number) => void;
}

export function DebtRepaymentDialog({
  open,
  onOpenChange,
  excessAmount,
  debtAmount,
  customerName,
  onConfirm,
}: DebtRepaymentDialogProps) {
  const t = useTranslations('Parties');
  const tc = useTranslations('Common');
  const { formatPrice } = useNumberFormat();
  const currencySymbol = useSettingsStore((state) => state.settings.currency_symbol);

  const [repaymentAmount, setRepaymentAmount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const maxRepayment = Math.min(excessAmount, debtAmount);

  const handleAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = convertBengaliToEnglishNumerals(e.target.value);
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setRepaymentAmount(value);
      setError(null);
    }
  }, []);

  const handleQuickAmount = useCallback((amount: number) => {
    setRepaymentAmount(amount.toString());
    setError(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (repaymentAmount === '') {
      setError(t('repay_enter_amount'));
      return;
    }

    const amount = parseFloat(repaymentAmount);

    if (isNaN(amount) || amount <= 0) {
      setError(t('repay_invalid_amount'));
      return;
    }

    if (amount > maxRepayment) {
      setError(t('repay_amount_exceeds', { max: formatPrice(maxRepayment) }));
      return;
    }

    onConfirm(amount);
    setRepaymentAmount('');
    setError(null);
    onOpenChange(false);
  }, [repaymentAmount, maxRepayment, onConfirm, onOpenChange, t, formatPrice]);

  const handleSkip = useCallback(() => {
    setRepaymentAmount('');
    setError(null);
    onOpenChange(false);
  }, [onOpenChange]);

  const parsedAmount = useMemo(() => {
    const val = parseFloat(repaymentAmount);
    return isNaN(val) ? 0 : val;
  }, [repaymentAmount]);

  const remainingDebt = Math.max(0, debtAmount - parsedAmount);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('debt_repayment')}</DialogTitle>
          <DialogDescription>
            {t('debt_repayment_desc', { name: customerName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">{t('outstanding_debt')}</p>
              <p className="text-lg font-bold text-red-700">{formatPrice(debtAmount)}</p>
            </div>
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">{t('excess_payment')}</p>
              <p className="text-lg font-bold text-green-700">{formatPrice(excessAmount)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="repayment-amount">{t('amount_to_repay')}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currencySymbol}</span>
              <Input
                id="repayment-amount"
                type="text"
                inputMode="numeric"
                value={repaymentAmount}
                onChange={handleAmountChange}
                placeholder="0"
                className="pl-8 text-lg h-11 font-semibold text-right"
              />
            </div>
          </div>

          {parsedAmount > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                {t('remaining_debt', { amount: formatPrice(remainingDebt) })}
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickAmount(Math.min(1000, maxRepayment))}
              disabled={maxRepayment < 1000}
              className="text-xs"
            >
              {currencySymbol}১০০০
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickAmount(Math.min(5000, maxRepayment))}
              disabled={maxRepayment < 5000}
              className="text-xs"
            >
              {currencySymbol}৫০০০
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickAmount(maxRepayment)}
              className="text-xs"
            >
              {t('all_amount', { amount: formatPrice(maxRepayment) })}
            </Button>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleSkip}>
            {t('skip')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!repaymentAmount || parsedAmount <= 0}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            {tc('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DebtRepaymentDialog;
