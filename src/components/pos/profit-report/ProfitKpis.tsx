'use client';

import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Lightbulb, TrendingUp } from 'lucide-react';
import type { ProfitInsights, ProfitSummary } from './types';
import { profitColor } from './utils';

interface ProfitKpisProps {
  loading: boolean;
  summary: ProfitSummary | null;
  insights: ProfitInsights | null;
  formatPrice: (n: number) => string;
  formatNumber: (n: number) => string;
  formatStringNumbers: (v: string) => string;
  t: (key: string) => string;
}

export function ProfitKpis({
  loading,
  summary,
  insights,
  formatPrice,
  formatNumber,
  formatStringNumbers,
  t,
}: ProfitKpisProps) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
              {t('total_revenue')}
            </p>
            <p className="text-lg md:text-xl font-extrabold mt-1">
              {loading ? '…' : formatPrice(summary?.totalRevenue ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
              {t('cogs')}
            </p>
            <p className="text-lg md:text-xl font-extrabold mt-1 text-amber-700">
              {loading ? '…' : formatPrice(summary?.totalCost ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30">
          <CardContent className="p-3.5">
            <p className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">
              {t('net_profit')}
            </p>
            <p className={`text-lg md:text-xl font-extrabold mt-1 ${profitColor(summary?.totalProfit ?? 0)}`}>
              {loading ? '…' : formatPrice(summary?.totalProfit ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
              {t('margin_label')}
            </p>
            <p className="text-lg md:text-xl font-extrabold mt-1">
              {loading
                ? '…'
                : `${formatStringNumbers(String(summary?.profitMargin ?? 0))}%`}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {formatNumber(summary?.orderCount ?? 0)} {t('orders')}
            </p>
          </CardContent>
        </Card>
      </div>

      {insights && !loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="rounded-xl border-indigo-100 dark:border-indigo-900/40">
            <CardContent className="p-3 flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-indigo-600">{t('insight_top_profit')}</p>
                <p className="text-sm font-semibold truncate">
                  {insights.topByProfit?.name || '—'}
                </p>
                {insights.topByProfit && (
                  <p className="text-xs text-emerald-600 font-medium">
                    {formatPrice(insights.topByProfit.profit)}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-amber-100 dark:border-amber-900/40">
            <CardContent className="p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-amber-600">{t('insight_low_margin')}</p>
                <p className="text-sm font-semibold truncate">
                  {insights.lowestMargin?.name || '—'}
                </p>
                {insights.lowestMargin && (
                  <p className="text-xs text-amber-700 font-medium">
                    {formatStringNumbers(String(insights.lowestMargin.margin))}%
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-red-100 dark:border-red-900/40">
            <CardContent className="p-3 flex items-start gap-2">
              <TrendingUp className="w-4 h-4 text-red-500 mt-0.5 shrink-0 rotate-180" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-red-600">{t('insight_loss_makers')}</p>
                <p className="text-lg font-extrabold text-red-600">
                  {formatNumber(insights.lossMakers)}
                </p>
                <p className="text-[10px] text-muted-foreground">{t('insight_loss_hint')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
