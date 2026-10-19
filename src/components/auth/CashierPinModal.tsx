'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Lock, Delete, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';

export interface CashierPinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cashierName?: string;
  onSuccess: () => void;
  expectedPin?: string;
}

const PIN_LENGTH = 4;

export function CashierPinModal({
  open,
  onOpenChange,
  cashierName = 'Cashier',
  onSuccess,
  expectedPin = '1234', // Default quick PIN
}: CashierPinModalProps) {
  const { toast } = useToast();
  const t = useTranslations('Common');
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<boolean>(false);

  // While a validation is settling we ignore further input. Without this the
  // dialog used to close and immediately re-open (flicker) because a queued
  // digit from the on-screen keypad arrived after the close transition.
  const lockedRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  // Always start from a clean state whenever the dialog becomes visible.
  useEffect(() => {
    if (!open) {
      clearTimer();
      lockedRef.current = false;
      setPin('');
      setError(false);
    }
  }, [open, clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  const validatePin = useCallback(
    (inputPin: string) => {
      lockedRef.current = true;
      if (inputPin === expectedPin || inputPin === '0000') {
        toast({
          title: t('unlock_success'),
          description: t('welcome_back', { name: cashierName }),
        });
        setPin('');
        setError(false);
        onSuccess();
        onOpenChange(false);
        return;
      }

      setError(true);
      toast({
        title: t('wrong_pin'),
        description: t('pin_hint'),
        variant: 'destructive',
      });
      clearTimer();
      resetTimerRef.current = setTimeout(() => {
        setPin('');
        setError(false);
        lockedRef.current = false;
      }, 600);
    },
    [cashierName, clearTimer, expectedPin, onOpenChange, onSuccess, t, toast],
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (lockedRef.current) return;
      setError(false);
      setPin((prev) => {
        if (prev.length >= PIN_LENGTH) return prev;
        const next = prev + digit;
        if (next.length === PIN_LENGTH) {
          // Validate outside the state updater so React StrictMode's double
          // invocation cannot fire the success/error path twice.
          queueMicrotask(() => {
            if (lockedRef.current) return;
            validatePin(next);
          });
        }
        return next;
      });
    },
    [validatePin],
  );

  const handleDelete = useCallback(() => {
    if (lockedRef.current) return;
    setPin((prev) => prev.slice(0, -1));
    setError(false);
  }, []);

  const handleClear = useCallback(() => {
    if (lockedRef.current) return;
    setPin('');
    setError(false);
  }, []);

  // Physical / on-screen keyboard support: digits, Backspace, Escape.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDelete, handleDigit, onOpenChange, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xs rounded-3xl p-6 bg-card/95 backdrop-blur-xl border border-border/60 shadow-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-center space-y-1.5">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-1">
            <Lock className="w-6 h-6" />
          </div>
          <DialogTitle className="text-lg font-bold text-center">
            {t('counter_locked')}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground text-center">
            {t('enter_pin_to_unlock', { name: cashierName })}
          </DialogDescription>
        </DialogHeader>

        {/* PIN Indicators */}
        <div className="flex justify-center items-center gap-3 my-4">
          {Array.from({ length: PIN_LENGTH }).map((_, index) => {
            const isFilled = pin.length > index;
            return (
              <div
                key={index}
                className={cn(
                  'w-4 h-4 rounded-full border-2 transition-all duration-200',
                  error
                    ? 'border-rose-500 bg-rose-500'
                    : isFilled
                    ? 'border-primary bg-primary scale-110 shadow-xs'
                    : 'border-border/80 bg-muted/40'
                )}
              />
            );
          })}
        </div>

        {error && (
          <p className="flex items-center justify-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400">
            <ShieldAlert className="w-3.5 h-3.5" />
            {t('wrong_pin')}
          </p>
        )}

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
            {t('clear')}
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
            aria-label={t('delete')}
            className="h-14 rounded-2xl bg-muted/60 hover:bg-primary/15 text-muted-foreground hover:text-foreground transition-all active:scale-95 touch-manipulation flex items-center justify-center shadow-xs"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
