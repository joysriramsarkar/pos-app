'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, Download } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import type { ChartStyle, SalesReportProps, ViewMode } from './types';
import { downloadSalesCsv, parseDateSafe } from './utils';
import { SalesFilters } from './SalesFilters';
import { SalesKpis } from './SalesKpis';
import { SalesCharts } from './SalesCharts';
import { SalesTable } from './SalesTable';

export type { SalesReportProps } from './types';

export function SalesReport({ onBack }: SalesReportProps) {
  const t = useTranslations('Reports');
  const { formatPrice, formatDate, formatNumber, formatStringNumbers, formatCompact } = useNumberFormat();

  const [data, setData] = useState<any[]>([]);
  const [prevData, setPrevData] = useState<any[]>([]);
  const [, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [chartStyle, setChartStyle] = useState<ChartStyle>('bar');

  const [singleDate, setSingleDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const fetchFrom = viewMode === 'daily' ? singleDate : dateFrom;
  const fetchTo = viewMode === 'daily' ? singleDate : dateTo;

  useEffect(() => {
    setLoading(true);
    const hourlyParam = viewMode === 'daily' ? '&hourly=true' : '';
    const compareParam = showComparison && viewMode !== 'daily' ? '&compare=true' : '';
    const url = `/api/reports/sales?from=${fetchFrom}&to=${fetchTo}${hourlyParam}${compareParam}&tzOffset=${new Date().getTimezoneOffset()}`;

    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res) {
          setData(res.chartData ?? []);
          setSummary(res.summary);
          setPrevData(res.prevChartData ?? []);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error(err);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [fetchFrom, fetchTo, viewMode, showComparison]);

  const processedChartData = useMemo(() => {
    if (viewMode === 'daily') {
      return data;
    }

    const map: Record<string, { label: string; revenue: number; profit: number; count: number; ts: number }> = {};

    data.forEach((e) => {
      const d = parseDateSafe(e.date);
      let k = '';
      let ts = 0;

      if (viewMode === 'weekly') {
        const dayIndex = d.getDay();
        const daysMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        k = daysMap[dayIndex];
        ts = dayIndex === 0 ? 7 : dayIndex;
      } else {
        const dateNum = d.getDate();
        if (dateNum <= 7) {
          k = 'week_1';
          ts = 1;
        } else if (dateNum <= 14) {
          k = 'week_2';
          ts = 2;
        } else if (dateNum <= 21) {
          k = 'week_3';
          ts = 3;
        } else if (dateNum <= 28) {
          k = 'week_4';
          ts = 4;
        } else {
          k = 'last_week';
          ts = 5;
        }
      }

      if (!map[k]) {
        map[k] = { label: k, revenue: 0, profit: 0, count: 0, ts };
      }
      map[k].revenue += Number(e.revenue || 0);
      map[k].profit += Number(e.profit || 0);
      map[k].count += Number(e.count || 0);
    });

    return Object.values(map)
      .sort((a, b) => a.ts - b.ts)
      .map(({ label, revenue, profit, count }) => ({
        date: t(label) || label,
        revenue,
        profit,
        count,
      }));
  }, [data, viewMode, t]);

  const chartDataWithComparison = useMemo(() => {
    if (!showComparison || !prevData.length || viewMode === 'daily') return processedChartData;
    return processedChartData.map((d, i) => ({
      ...d,
      prevRevenue: prevData[i]?.prevRevenue ?? 0,
    }));
  }, [processedChartData, prevData, showComparison, viewMode]);

  const totalRevenue = useMemo(() => {
    return processedChartData.reduce((s, e) => s + (e.revenue || 0), 0);
  }, [processedChartData]);

  const totalProfit = useMemo(() => {
    return processedChartData.reduce((s, e) => s + (e.profit || 0), 0);
  }, [processedChartData]);

  const totalCount = useMemo(() => {
    return processedChartData.reduce((s, e) => s + (e.count || 0), 0);
  }, [processedChartData]);

  const averageOrderValue = useMemo(() => {
    return totalCount > 0 ? totalRevenue / totalCount : 0;
  }, [totalRevenue, totalCount]);

  const profitMargin = useMemo(() => {
    return totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  }, [totalRevenue, totalProfit]);

  const avgRevenue = processedChartData.length > 0
    ? processedChartData.reduce((s, d) => s + d.revenue, 0) / processedChartData.length
    : 0;

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 bg-slate-50/50 dark:bg-background overflow-y-auto min-h-0 pb-24 animate-page-enter">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              {t('sales_trend')}
            </h1>
            <p className="text-muted-foreground text-xs">{t('subtitle')}</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs h-9"
          onClick={() => downloadSalesCsv(processedChartData, totalRevenue, totalProfit, totalCount)}
          disabled={!processedChartData.length}
        >
          <Download className="w-3.5 h-3.5" /> {t('csv')}
        </Button>
      </div>

      <SalesFilters
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        singleDate={singleDate}
        onSingleDateChange={setSingleDate}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        formatDate={formatDate}
        t={t}
      />

      <SalesKpis
        totalRevenue={totalRevenue}
        totalProfit={totalProfit}
        totalCount={totalCount}
        averageOrderValue={averageOrderValue}
        profitMargin={profitMargin}
        formatPrice={formatPrice}
        formatNumber={formatNumber}
        t={t}
      />

      <SalesCharts
        loading={loading}
        chartDataWithComparison={chartDataWithComparison}
        processedChartData={processedChartData}
        viewMode={viewMode}
        chartStyle={chartStyle}
        onChartStyleChange={setChartStyle}
        showComparison={showComparison}
        onToggleComparison={() => setShowComparison((v) => !v)}
        avgRevenue={avgRevenue}
        formatPrice={formatPrice}
        formatStringNumbers={formatStringNumbers}
        formatCompact={formatCompact}
        t={t}
      />

      <SalesTable
        loading={loading}
        viewMode={viewMode}
        processedChartData={processedChartData}
        formatPrice={formatPrice}
        formatNumber={formatNumber}
        formatStringNumbers={formatStringNumbers}
        t={t}
      />
    </div>
  );
}
