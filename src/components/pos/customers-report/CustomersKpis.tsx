'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { CustomerStats } from './types';

interface CustomersKpisProps {
  stats: CustomerStats;
  formatPrice: (n: number) => string;
  formatNumber: (n: number) => string;
  formatStringNumbers: (v: string) => string;
  t: (key: string) => string;
}

export function CustomersKpis({
  stats,
  formatPrice,
  formatNumber,
  formatStringNumbers,
  t,
}: CustomersKpisProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card className="rounded-2xl shadow-sm bg-blue-50/50 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900/30">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">{t('top_customer_spend')}</p>
          <p className="text-sm font-semibold text-blue-700 truncate mt-1">{stats.maxSpent.name}</p>
          <p className="text-sm font-bold text-blue-600">{formatPrice(stats.maxSpent.value)}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">{t('net_profit')}</p>
          <p className="text-lg md:text-xl font-extrabold text-emerald-700 mt-1">{formatPrice(stats.totalProfit)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {formatStringNumbers(stats.margin.toFixed(1))}% {t('margin')}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('insight_top_profit')}</p>
          <p className="text-sm font-semibold truncate mt-1">{stats.maxProfit.name}</p>
          <p className="text-sm font-bold text-emerald-600">{formatPrice(stats.maxProfit.value)}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('total_sales_invoiced')}</p>
          <p className="text-lg md:text-xl font-extrabold mt-1">{formatNumber(stats.totalInvoices)} {t('orders')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
