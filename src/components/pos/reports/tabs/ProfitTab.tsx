'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, ExternalLink, PieChart as PieChartIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { DonutShareChart, HorizontalRankChart } from '@/components/pos/report-charts';
import type { ProfitGroup, ProfitInsightsData, ProfitRow, ProfitSummaryData } from '../types';
import { downloadCSV } from '../utils';

export function ProfitTab({
  profitGroup,
  onProfitGroupChange,
  profitRows,
  profitSummary,
  profitInsights,
  isLoading,
  error,
  dateFilter,
  customDateInputs,
  onNavigate,
}: {
  profitGroup: ProfitGroup;
  onProfitGroupChange: (g: ProfitGroup) => void;
  profitRows: ProfitRow[];
  profitSummary: ProfitSummaryData | null;
  profitInsights: ProfitInsightsData | null;
  isLoading: boolean;
  error: string | null;
  dateFilter: React.ReactNode;
  customDateInputs: React.ReactNode;
  onNavigate?: (page: string) => void;
}) {
  const t = useTranslations('Reports');
  const { formatPrice, formatNumber, formatStringNumbers } = useNumberFormat();

  const profitComposition = useMemo(() => {
    if (!profitSummary) return [];
    const cost = Math.max(0, profitSummary.totalCost);
    const profit = Math.max(0, profitSummary.totalProfit);
    const loss = profitSummary.totalProfit < 0 ? Math.abs(profitSummary.totalProfit) : 0;
    const slices = [
      { name: t('cogs'), value: cost, color: 'var(--chart-4)' },
      { name: t('profit'), value: profit, color: 'var(--chart-2)' },
    ];
    if (loss > 0) slices.push({ name: t('insight_loss_makers'), value: loss, color: 'var(--chart-5)' });
    return slices.filter((s) => s.value > 0);
  }, [profitSummary, t]);

  const profitRankData = useMemo(
    () =>
      profitRows.slice(0, 8).map((r) => ({
        name: r.invoiceNumber || r.name || r.customerName || '—',
        profit: Number(r.profit),
        revenue: Number(r.revenue),
      })),
    [profitRows],
  );

  return (
    <>
      {customDateInputs && <div className="mb-3">{customDateInputs}</div>}
      <Card className="rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-emerald-500" />
              {t('profit_report_title')}
            </CardTitle>
            <CardDescription>{t('profit_report_subtitle')}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {dateFilter}
            {onNavigate && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 min-h-9 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={() => onNavigate('profit-report')}
              >
                <ExternalLink className="w-3.5 h-3.5" /> {t('detailed_report')}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() =>
                downloadCSV(
                  [
                    ['#', t('csv_name'), t('csv_revenue'), t('csv_cost'), t('csv_profit'), t('csv_margin')],
                    ...profitRows.map((r, i) => [
                      i + 1,
                      r.invoiceNumber || r.name || r.customerName || '',
                      Number(r.revenue).toFixed(2),
                      Number(r.cost).toFixed(2),
                      Number(r.profit).toFixed(2),
                      Number(r.margin ?? 0).toFixed(1),
                    ]),
                  ],
                  `profit-${profitGroup}`,
                )
              }
            >
              <Download className="w-4 h-4" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1 bg-muted p-1 rounded-lg w-fit">
            {([
              ['orders', t('profit_by_order')],
              ['items', t('profit_by_item')],
              ['customers', t('profit_by_customer')],
            ] as const).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={profitGroup === key ? 'default' : 'ghost'}
                className="h-8 text-xs"
                onClick={() => onProfitGroupChange(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">{t('total_revenue')}</p>
              <p className="text-base font-bold mt-0.5">{formatPrice(profitSummary?.totalRevenue ?? 0)}</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">{t('cogs')}</p>
              <p className="text-base font-bold mt-0.5 text-amber-700">{formatPrice(profitSummary?.totalCost ?? 0)}</p>
            </div>
            <div className="rounded-xl border bg-emerald-50/50 dark:bg-emerald-950/10 p-3">
              <p className="text-[10px] uppercase font-bold text-emerald-600">{t('net_profit')}</p>
              <p className={`text-base font-bold mt-0.5 ${(profitSummary?.totalProfit ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {formatPrice(profitSummary?.totalProfit ?? 0)}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">{t('margin_label')}</p>
              <p className="text-base font-bold mt-0.5">
                {formatStringNumbers(String(profitSummary?.profitMargin ?? 0))}%
              </p>
            </div>
          </div>

          {profitInsights && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border p-2.5">
                <p className="text-muted-foreground font-medium">{t('insight_top_profit')}</p>
                <p className="font-semibold truncate">{profitInsights.topByProfit?.name || '—'}</p>
                {profitInsights.topByProfit && (
                  <p className="text-emerald-600">{formatPrice(profitInsights.topByProfit.profit)}</p>
                )}
              </div>
              <div className="rounded-lg border p-2.5">
                <p className="text-muted-foreground font-medium">{t('insight_low_margin')}</p>
                <p className="font-semibold truncate">{profitInsights.lowestMargin?.name || '—'}</p>
                {profitInsights.lowestMargin && (
                  <p className="text-amber-600">
                    {formatStringNumbers(String(profitInsights.lowestMargin.margin ?? 0))}%
                  </p>
                )}
              </div>
              <div className="rounded-lg border p-2.5">
                <p className="text-muted-foreground font-medium">{t('insight_loss_makers')}</p>
                <p className="font-semibold text-red-600">{formatNumber(profitInsights.lossMakers)}</p>
              </div>
            </div>
          )}

          {!isLoading && profitRows.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <HorizontalRankChart
                  title={t('profit_rank_chart')}
                  description={t('profit_rank_desc')}
                  data={profitRankData}
                  valueKey="profit"
                  secondValueKey="revenue"
                  valueLabel={t('profit')}
                  secondLabel={t('revenue')}
                  color="var(--chart-2)"
                  secondColor="var(--chart-1)"
                  emptyLabel={t('no_data')}
                />
              </div>
              <DonutShareChart
                title={t('profit_composition')}
                description={t('profit_composition_desc')}
                data={profitComposition}
                emptyLabel={t('no_data')}
              />
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>
                    {profitGroup === 'orders'
                      ? t('invoice')
                      : profitGroup === 'items'
                        ? t('product')
                        : t('customer')}
                  </TableHead>
                  <TableHead className="text-right">{t('revenue')}</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">{t('cogs')}</TableHead>
                  <TableHead className="text-right">{t('profit')}</TableHead>
                  <TableHead className="text-right">{t('margin_col')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      {t('loading')}
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-destructive">
                      {error}
                    </TableCell>
                  </TableRow>
                ) : profitRows.length > 0 ? (
                  profitRows.map((r, i) => (
                    <TableRow key={String(r.id ?? r.invoiceNumber ?? r.name) + i}>
                      <TableCell className="text-muted-foreground text-sm">{formatNumber(i + 1)}</TableCell>
                      <TableCell className="font-medium">
                        <p className="text-sm">
                          {r.invoiceNumber || r.name || r.customerName || '—'}
                        </p>
                        {r.nameBn && (
                          <p className="text-xs text-muted-foreground">{r.nameBn}</p>
                        )}
                        {profitGroup === 'orders' && r.customerName && (
                          <p className="text-xs text-muted-foreground">{r.customerName}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatPrice(Number(r.revenue))}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums hidden sm:table-cell">
                        {formatPrice(Number(r.cost))}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold tabular-nums ${
                          Number(r.profit) >= 0 ? 'text-emerald-600' : 'text-red-500'
                        }`}
                      >
                        {formatPrice(Number(r.profit))}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {formatStringNumbers(String(r.margin ?? 0))}%
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      {t('no_data')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
