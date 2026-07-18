'use client';

import { Card, CardContent } from '@/components/ui/card';

interface SalesKpisProps {
  totalRevenue: number;
  totalProfit: number;
  totalCount: number;
  averageOrderValue: number;
  profitMargin: number;
  formatPrice: (n: number) => string;
  formatNumber: (n: number) => string;
  t: (key: string) => string;
}

export function SalesKpis({
  totalRevenue,
  totalProfit,
  totalCount,
  averageOrderValue,
  profitMargin,
  formatPrice,
  formatNumber,
  t,
}: SalesKpisProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <Card className="rounded-2xl shadow-sm bg-blue-50/50 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900/30">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">{t('total_revenue')}</p>
          <p className="text-lg md:text-xl font-extrabold text-blue-700 mt-1">{formatPrice(totalRevenue)}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">{t('net_profit')}</p>
          <p className="text-lg md:text-xl font-extrabold text-emerald-700 mt-1">{formatPrice(totalProfit)}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('total_sales')}</p>
          <p className="text-lg md:text-xl font-extrabold mt-1">{formatNumber(totalCount)} {t('invoices')}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('avg_order') || 'AOV'}</p>
          <p className="text-lg md:text-xl font-extrabold mt-1">{formatPrice(averageOrderValue)}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm bg-amber-50/50 dark:bg-amber-950/10 border-amber-100 dark:border-amber-900/30">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-amber-600 tracking-wider">{t('margin')}</p>
          <p className="text-lg md:text-xl font-extrabold text-amber-700 mt-1">{formatNumber(Number(profitMargin.toFixed(1)))}%</p>
        </CardContent>
      </Card>
    </div>
  );
}
