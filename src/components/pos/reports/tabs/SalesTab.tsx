'use client';

import React, { useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart2, Download, ExternalLink, Lightbulb } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { ComposedVolumeChart, MarginGauge } from '@/components/pos/report-charts';
import type { ChartType, DatePreset, SaleChartPoint, SummaryData } from '../types';
import { CHART_CYCLE } from '../types';

export function SalesTab({
  salesData,
  summaryData,
  isLoading,
  isToday,
  preset,
  chartType,
  onChartTypeChange,
  dateFilter,
  customDateInputs,
  onNavigate,
  onAskAi,
}: {
  salesData: SaleChartPoint[];
  summaryData: SummaryData | null;
  isLoading: boolean;
  isToday: boolean;
  preset: DatePreset;
  chartType: ChartType;
  onChartTypeChange: (ct: ChartType) => void;
  dateFilter: React.ReactNode;
  customDateInputs: React.ReactNode;
  onNavigate?: (page: string) => void;
  onAskAi: () => void;
}) {
  const t = useTranslations('Reports');
  const { formatPrice, formatCompact, formatStringNumbers, isBn } = useNumberFormat();

  const salesChartConfig = useMemo(
    () => ({
      revenue: { label: t('chart_revenue'), color: 'var(--chart-1)' },
      profit: { label: t('chart_profit'), color: 'var(--chart-2)' },
      count: { label: t('chart_orders'), color: 'var(--chart-3)' },
      aov: { label: t('aov'), color: 'var(--chart-1)' },
    }),
    [t],
  );

  const salesXTick = useCallback(
    (v: string) => {
      const d = new Date(v);
      if (Number.isNaN(d.getTime()) || isToday) return formatStringNumbers(v);
      if (preset === '7') return d.toLocaleDateString(isBn ? 'bn-BD' : 'en-IN', { weekday: 'short' });
      if (preset === '365') {
        return d.toLocaleDateString(isBn ? 'bn-BD' : 'en-IN', { month: 'short', year: '2-digit' });
      }
      return formatStringNumbers(`${d.getDate()}/${d.getMonth() + 1}`);
    },
    [preset, isToday, isBn, formatStringNumbers],
  );

  const salesWithAov = useMemo(
    () =>
      salesData.map((d) => ({
        ...d,
        aov: d.count > 0 ? d.revenue / d.count : 0,
        margin: d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0,
      })),
    [salesData],
  );

  const cycleChartType = () =>
    onChartTypeChange(CHART_CYCLE[(CHART_CYCLE.indexOf(chartType) + 1) % CHART_CYCLE.length]);

  const chartTypeLabel =
    chartType === 'bar' ? t('line') : chartType === 'line' ? t('area') : t('bar');

  const handleExportCSV = useCallback(() => {
    if (!salesData.length) return;
    const header = isToday ? ['Hour', 'Revenue', 'Profit', 'Orders'] : ['Date', 'Revenue', 'Profit', 'Orders'];
    const rows = [
      header,
      ...salesData.map((d) => [d.date, d.revenue.toFixed(2), d.profit.toFixed(2), d.count]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [salesData, isToday]);

  return (
    <>
      {customDateInputs && <div className="mb-3">{customDateInputs}</div>}
      <Card className="rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle>{t('sales_trend')}</CardTitle>
            <CardDescription>{isToday ? t('hourly_sales_desc') : t('daily_sales_desc')}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {dateFilter}
            <Button
              variant="outline"
              size="sm"
              className="gap-1 min-h-9 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
              onClick={onAskAi}
            >
              <Lightbulb className="w-4 h-4" /><span className="hidden sm:inline">{t('ask_ai')}</span>
            </Button>
            {onNavigate && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 min-h-9 border-blue-200 text-blue-600 hover:bg-blue-50"
                onClick={() => onNavigate('sales-report')}
              >
                <ExternalLink className="w-3.5 h-3.5" /> {t('detailed_report') || 'Detailed'}
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1 min-h-9" onClick={handleExportCSV}>
              <Download className="w-4 h-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1 min-h-9" onClick={cycleChartType}>
              <BarChart2 className="w-4 h-4" />{chartTypeLabel}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="w-full h-64 md:h-80">
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <Skeleton className="w-full h-full rounded-lg" />
              </div>
            ) : salesData?.length > 0 ? (
              <ChartContainer config={salesChartConfig} className="w-full h-full aspect-auto">
                {chartType === 'bar' ? (
                  <BarChart data={salesData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                    <XAxis dataKey="date" tickFormatter={salesXTick} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={60} />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(label) => salesXTick(String(label))}
                          formatter={(value, name, item) => (
                            <div className="flex items-center gap-2 min-w-[130px]">
                              <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
                              <span className="text-muted-foreground text-xs flex-1">{name}</span>
                              <span className="font-bold text-foreground tabular-nums">{formatPrice(Number(value))}</span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="revenue" name={t('chart_revenue')} fill="var(--color-revenue)" radius={[4, 4, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="profit" name={t('chart_profit')} fill="var(--color-profit)" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  </BarChart>
                ) : chartType === 'line' ? (
                  <LineChart data={salesData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                    <XAxis dataKey="date" tickFormatter={salesXTick} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={60} />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(label) => salesXTick(String(label))}
                          formatter={(value, name, item) => (
                            <div className="flex items-center gap-2 min-w-[130px]">
                              <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
                              <span className="text-muted-foreground text-xs flex-1">{name}</span>
                              <span className="font-bold text-foreground tabular-nums">{formatPrice(Number(value))}</span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="monotone" dataKey="revenue" name={t('chart_revenue')} stroke="var(--color-revenue)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="profit" name={t('chart_profit')} stroke="var(--color-profit)" strokeWidth={2} dot={false} />
                  </LineChart>
                ) : (
                  <AreaChart data={salesData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="salesRevFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="salesProfitFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-profit)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--color-profit)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                    <XAxis dataKey="date" tickFormatter={salesXTick} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={60} />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(label) => salesXTick(String(label))}
                          formatter={(value, name, item) => (
                            <div className="flex items-center gap-2 min-w-[130px]">
                              <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
                              <span className="text-muted-foreground text-xs flex-1">{name}</span>
                              <span className="font-bold text-foreground tabular-nums">{formatPrice(Number(value))}</span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Area type="monotone" dataKey="revenue" name={t('chart_revenue')} stroke="var(--color-revenue)" fill="url(#salesRevFill)" strokeWidth={2} />
                    <Area type="monotone" dataKey="profit" name={t('chart_profit')} stroke="var(--color-profit)" fill="url(#salesProfitFill)" strokeWidth={2} />
                  </AreaChart>
                )}
              </ChartContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center border border-dashed rounded-lg">
                <p className="text-muted-foreground">{t('no_sales_data')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!isLoading && salesData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          <div className="lg:col-span-2">
            <ComposedVolumeChart
              title={t('orders_volume_chart')}
              description={t('orders_volume_desc')}
              data={salesWithAov}
              barKey="count"
              barLabel={t('orders')}
              lineKey="aov"
              lineLabel={t('aov')}
              xTickFormatter={salesXTick}
              emptyLabel={t('no_sales_data')}
            />
          </div>
          <MarginGauge
            title={t('margin_gauge_title')}
            description={t('margin_gauge_desc')}
            marginPct={Number(summaryData?.profitMargin ?? 0)}
            emptyLabel={t('no_data')}
          />
        </div>
      )}
    </>
  );
}
