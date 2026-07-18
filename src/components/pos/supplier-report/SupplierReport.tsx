'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Truck, Download } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { subDays, format } from 'date-fns';
import type { ChartStyle, SupplierReportProps, ViewMode } from './types';
import { EMPTY_SUMMARY } from './types';
import { downloadSuppliersCsv, parseDateSafe } from './utils';
import { SupplierFilters } from './SupplierFilters';
import { SupplierKpis } from './SupplierKpis';
import { SupplierCharts } from './SupplierCharts';
import { SupplierTables } from './SupplierTables';

export type { SupplierReportProps } from './types';

export function SupplierReport({ onBack }: SupplierReportProps) {
  const t = useTranslations('Reports');
  const locale = useLocale();
  const isBn = locale === 'bn';
  const { formatPrice, formatDate, formatNumber, formatStringNumbers, formatCompact } = useNumberFormat();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

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
    const url = `/api/reports/purchases?from=${fetchFrom}&to=${fetchTo}${hourlyParam}&tzOffset=${new Date().getTimezoneOffset()}`;

    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res && res.success) {
          setData(res);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error(err);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [fetchFrom, fetchTo, viewMode]);

  const summary = data?.summary || EMPTY_SUMMARY;

  const processedChartData = useMemo(() => {
    const rawChartData = data?.chartData || [];
    if (viewMode === 'daily') {
      return rawChartData;
    }

    const map: Record<string, { label: string; amount: number; count: number; ts: number }> = {};

    rawChartData.forEach((e: any) => {
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
        map[k] = { label: k, amount: 0, count: 0, ts };
      }
      map[k].amount += Number(e.amount || 0);
      map[k].count += Number(e.count || 0);
    });

    return Object.values(map)
      .sort((a, b) => a.ts - b.ts)
      .map(({ label, amount, count }) => ({
        date: t(label) || label,
        amount,
        count,
      }));
  }, [data, viewMode, t]);

  const topSuppliers = data?.topSuppliers || [];
  const topProducts = data?.topProducts || [];

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 bg-slate-50/50 overflow-y-auto min-h-0 pb-24 animate-page-enter">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-500" />
              {t('supplier_report_title')}
            </h1>
            <p className="text-muted-foreground text-xs">{t('supplier_report_desc')}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9" onClick={() => downloadSuppliersCsv(topSuppliers)} disabled={!topSuppliers.length}>
          <Download className="w-3.5 h-3.5" /> {t('csv')}
        </Button>
      </div>

      <SupplierFilters
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        singleDate={singleDate}
        onSingleDateChange={setSingleDate}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        formatDate={formatDate}
        formatStringNumbers={formatStringNumbers}
        t={t}
      />

      <SupplierKpis summary={summary} formatPrice={formatPrice} formatNumber={formatNumber} t={t} />

      <SupplierCharts
        loading={loading}
        processedChartData={processedChartData}
        viewMode={viewMode}
        chartStyle={chartStyle}
        onChartStyleChange={setChartStyle}
        dateFrom={dateFrom}
        dateTo={dateTo}
        isBn={isBn}
        formatPrice={formatPrice}
        formatStringNumbers={formatStringNumbers}
        formatCompact={formatCompact}
        t={t}
      />

      <SupplierTables
        loading={loading}
        topSuppliers={topSuppliers}
        topProducts={topProducts}
        formatPrice={formatPrice}
        formatNumber={formatNumber}
        t={t}
      />
    </div>
  );
}
