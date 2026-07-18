'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { PaymentSummary } from './types';

interface PaymentKpisProps {
  summary: PaymentSummary;
  formatPrice: (n: number) => string;
  t: (key: string) => string;
}

export function PaymentKpis({ summary, formatPrice, t }: PaymentKpisProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('payment_summary')}</p>
          <p className="text-lg md:text-xl font-extrabold text-indigo-600 mt-1">{formatPrice(summary.total)}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('cash_payments')}</p>
          <p className="text-lg md:text-xl font-extrabold text-emerald-600 mt-1">{formatPrice(summary.cash)}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('upi_payments')}</p>
          <p className="text-lg md:text-xl font-extrabold text-blue-600 mt-1">{formatPrice(summary.upi)}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('dues_created')}</p>
          <p className="text-lg md:text-xl font-extrabold text-red-600 mt-1">{formatPrice(summary.due)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
