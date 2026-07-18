'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { SupplierSummary } from './types';

interface SupplierKpisProps {
  summary: SupplierSummary;
  formatPrice: (n: number) => string;
  formatNumber: (n: number) => string;
  t: (key: string) => string;
}

export function SupplierKpis({ summary, formatPrice, formatNumber, t }: SupplierKpisProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card className="rounded-2xl shadow-sm bg-blue-50/50 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900/30">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">{t('total_purchases_stock_cost')}</p>
          <p className="text-lg md:text-xl font-extrabold text-blue-700 mt-1">{formatPrice(summary.totalPurchasesAmount)}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">{t('supplier_payments_made')}</p>
          <p className="text-lg md:text-xl font-extrabold text-emerald-700 mt-1">{formatPrice(summary.totalPaymentsAmount)}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm bg-amber-50/50 dark:bg-amber-950/10 border-amber-100 dark:border-amber-900/30">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-amber-600 tracking-wider">{t('total_purchase_orders')}</p>
          <p className="text-lg md:text-xl font-extrabold text-amber-700 mt-1">{formatNumber(summary.totalOrdersCount)} {t('orders_suffix')}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3.5 flex flex-col justify-between h-full">
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('active_pending_orders')}</p>
          <p className="text-lg md:text-xl font-extrabold mt-1 text-red-500">
            {formatNumber(summary.orderedOrdersCount + summary.pendingOrdersCount)} {t('pending_suffix')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
