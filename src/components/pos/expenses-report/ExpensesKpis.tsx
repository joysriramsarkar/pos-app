'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Banknote } from 'lucide-react';

interface ExpensesKpisProps {
  total: number;
  filteredCount: number;
  dailyDataLength: number;
  viewMode: string;
  formatPrice: (n: number) => string;
  formatStringNumbers: (v: string | number) => string;
  t: (key: string, values?: any) => string;
}

export function ExpensesKpis({
  total,
  filteredCount,
  dailyDataLength,
  viewMode,
  formatPrice,
  formatStringNumbers,
  t,
}: ExpensesKpisProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Card className="rounded-2xl shadow-sm bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-800/40">
        <CardContent className="p-3 flex items-center gap-2">
          <Banknote className="w-5 h-5 text-red-600 shrink-0" />
          <div>
            <p className="text-[10px] text-red-600 font-medium">{t('total')}</p>
            <p className="text-lg font-black text-red-700">{formatPrice(total)}</p>
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">{t('entry')}</p>
          <p className="text-lg font-bold">{t('entries_count', { count: formatStringNumbers(filteredCount) })}</p>
        </CardContent>
      </Card>
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">
            {viewMode === 'daily' ? t('avg_entry') : t('avg_daily')}
          </p>
          <p className="text-lg font-bold">{formatPrice(dailyDataLength ? total / dailyDataLength : 0)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
