'use client';

import { useState, useCallback, useMemo } from 'react';
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
  const [repaymentAmount, setRepaymentAmount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price);
  };

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
      setError('Please enter an amount');
      return;
    }

    const amount = parseFloat(repaymentAmount);

    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (amount > maxRepayment) {
      setError(`Amount cannot exceed ${formatPrice(maxRepayment)}`);
      return;
    }

    onConfirm(amount);
    setRepaymentAmount('');
    setError(null);
    onOpenChange(false);
  }, [repaymentAmount, maxRepayment, onConfirm, onOpenChange]);

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
          <DialogTitle>Apply Excess Payment to Debt</DialogTitle>
          <DialogDescription>
            {customerName} has outstanding debt. Would you like to use the excess payment to repay some of it?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Outstanding Debt</p>
              <p className="text-lg font-bold text-red-700">{formatPrice(debtAmount)}</p>
            </div>
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Excess Payment</p>
              <p className="text-lg font-bold text-green-700">{formatPrice(excessAmount)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="repayment-amount">Amount to Repay</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
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
                Remaining debt after repayment: <span className="font-bold">{formatPrice(remainingDebt)}</span>
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
              ₹1000
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickAmount(Math.min(5000, maxRepayment))}
              disabled={maxRepayment < 5000}
              className="text-xs"
            >
              ₹5000
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickAmount(maxRepayment)}
              className="text-xs"
            >
              All ({formatPrice(maxRepayment)})
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
            Skip
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!repaymentAmount || parsedAmount <= 0}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DebtRepaymentDialog;
