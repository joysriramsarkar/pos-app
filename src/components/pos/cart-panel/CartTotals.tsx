'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { CreditCard, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { paymentMethods } from './paymentMethods';

interface CartTotalsProps {
  paymentMethod: string;
  setPaymentMethod: (method: any) => void;
  customerName: string | null | undefined;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  isCartEmpty: boolean;
  onCheckout: () => void;
  formatPrice: (n: number) => string;
  t: (key: string) => string;
}

export function CartTotals({
  paymentMethod,
  setPaymentMethod,
  customerName,
  subtotal,
  discount,
  tax,
  total,
  isCartEmpty,
  onCheckout,
  formatPrice,
  t,
}: CartTotalsProps) {
  const visibleMethods = paymentMethods.filter(({ method }) => method !== 'Due' || customerName);

  return (
    <div className="flex-none mt-auto bg-background border-t p-1.5 md:p-0 shadow-[0_-8px_20px_-10px_rgba(0,0,0,0.12)] md:shadow-none z-10 shrink-0 pb-[72px] lg:pb-0">

      <div className="p-1.5 md:p-3">
        <Label className="text-[9px] md:text-[10px] font-semibold text-muted-foreground mb-1 block uppercase tracking-wider">{t('payment_method')}</Label>
        <div className={cn("grid gap-1", visibleMethods.length === 3 ? "grid-cols-3" : "grid-cols-4")}>
          {visibleMethods
            .map(({ method, icon, labelKey, color }) => (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentMethod(method)}
                className={cn(
                  'relative flex flex-col items-center justify-center min-w-0 max-w-full whitespace-nowrap rounded-lg border transition-all duration-200 touch-manipulation h-9 sm:h-9 px-0.5 py-0.5',
                  paymentMethod === method
                    ? 'border-emerald-600 bg-emerald-500/10 dark:border-emerald-500 shadow-sm shadow-emerald-500/10'
                    : 'border-border/50 bg-background hover:bg-muted/80 hover:border-emerald-500/30'
                )}
              >
                {paymentMethod === method && (
                  <div className="absolute top-0.5 right-0.5 bg-emerald-600 rounded-full p-0.5 shadow-sm">
                    <Check className="w-2 h-2 text-white" />
                  </div>
                )}
                <div className={cn('text-muted-foreground group-hover:text-foreground transition-colors shrink-0 flex items-center justify-center h-4 w-4 sm:h-4 sm:w-4', color)}>
                  {icon}
                </div>
                <span className={cn(
                  'mt-0.5 text-[8px] sm:text-[9px] md:text-[10px] font-bold tracking-tight truncate w-full text-center',
                  paymentMethod === method ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground/80'
                )}>
                  {t(labelKey as any)}
                </span>
              </button>
            ))}
        </div>

        <div className="flex justify-between text-[11px] md:text-xs mt-1.5 border-t pt-1">
          <span className="text-muted-foreground font-medium">{t('subtotal')}</span>
          <span className="font-semibold tabular-nums">{formatPrice(subtotal)}</span>
        </div>

        {discount > 0 && (
          <div className="flex justify-between items-center text-[11px] md:text-xs mt-0.5">
            <span className="text-muted-foreground font-medium">{t('discount')}</span>
            <span className="font-semibold text-destructive tabular-nums">-{formatPrice(discount)}</span>
          </div>
        )}

        {tax > 0 && (
          <div className="flex justify-between text-[11px] md:text-xs mt-0.5">
            <span className="text-muted-foreground font-medium">{t('tax')}</span>
            <span className="font-semibold tabular-nums">{formatPrice(tax)}</span>
          </div>
        )}

        <Separator className="my-1.5 md:my-2 bg-border/60" />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-end justify-between">
            <span className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('total')}</span>
            <span className="text-lg md:text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight tabular-nums">{formatPrice(total)}</span>
          </div>
          <Button
            size="lg"
            className={cn(
              "w-full h-10 md:h-12 text-sm md:text-base font-bold rounded-lg md:rounded-xl shadow-md md:shadow-lg transition-all duration-300 touch-manipulation flex items-center justify-center gap-1.5 btn-shimmer-overlay active:scale-[0.99]",
              isCartEmpty || total <= 0
                ? "bg-muted text-muted-foreground shadow-none pointer-events-none"
                : "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 hover:shadow-emerald-600/25 hover:-translate-y-0.5 active:translate-y-0"
            )}
            disabled={isCartEmpty || total <= 0}
            onClick={onCheckout}
          >
            <CreditCard className="w-4 h-4 md:w-5 md:h-5" />
            {t('complete_checkout')}
          </Button>
        </div>
      </div>
    </div>
  );
}
