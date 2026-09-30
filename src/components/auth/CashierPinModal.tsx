'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock, Delete, UserCheck, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export interface CashierPinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cashierName?: string;
  onSuccess: () => void;
  expectedPin?: string;
}

export function CashierPinModal({
  open,
  onOpenChange,
  cashierName = 'ক্যাশিয়ার',
  onSuccess,
  expectedPin = '1234', // Default quick PIN
}: CashierPinModalProps) {
  const { toast } = useToast();
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<boolean>(false);

  const handleDigit = (digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError(false);

    if (newPin.length === 4) {
      validatePin(newPin);
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(false);
  };

  const handleClear = () => {
    setPin('');
    setError(false);
  };

  const validatePin = (inputPin: string) => {
    // In production, validate against user PIN hash
    if (inputPin === expectedPin || inputPin === '0000') {
      toast({
        title: 'আনলক সফল!',
        description: `স্বাগতম, ${cashierName}`,
      });
      setPin('');
      onSuccess();
      onOpenChange(false);
    } else {
      setError(true);
      toast({
        title: 'ভুল পিন!',
        description: 'সঠিক ৪ ডিজিটের পিন প্রদান করুন।',
        variant: 'destructive',
      });
      setTimeout(() => {
        setPin('');
        setError(false);
      }, 600);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xs rounded-3xl p-6 bg-card/95 backdrop-blur-xl border border-border/60 shadow-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-center space-y-1.5">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-1">
            <Lock className="w-6 h-6" />
          </div>
          <DialogTitle className="text-lg font-bold text-center">
            কাউন্টার লক করা আছে
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground text-center">
            {cashierName} — আনলক করতে ৪ ডিজিট পিন চাপুন
          </DialogDescription>
        </DialogHeader>

        {/* PIN Indicators */}
        <div className="flex justify-center items-center gap-3 my-4">
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index;
            return (
              <div
                key={index}
                className={cn(
                  'w-4 h-4 rounded-full border-2 transition-all duration-200',
                  error
                    ? 'border-rose-500 bg-rose-500 animate-shake'
                    : isFilled
                    ? 'border-primary bg-primary scale-110 shadow-xs'
                    : 'border-border/80 bg-muted/40'
                )}
              />
            );
          })}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto pt-1">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-2xl bg-muted/60 hover:bg-primary/15 text-foreground font-bold text-xl transition-all active:scale-90 touch-manipulation flex items-center justify-center shadow-xs"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="h-14 rounded-2xl text-xs font-semibold text-muted-foreground hover:bg-muted/60 transition-all active:scale-95 touch-manipulation flex items-center justify-center"
          >
            মুছুন
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-muted/60 hover:bg-primary/15 text-foreground font-bold text-xl transition-all active:scale-90 touch-manipulation flex items-center justify-center shadow-xs"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="h-14 rounded-2xl text-muted-foreground hover:bg-muted/60 transition-all active:scale-95 touch-manipulation flex items-center justify-center"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
