'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Download, TrendingUp, AlertTriangle,
} from 'lucide-react';
import { type ChartConfig } from '@/components/ui/chart';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { format, subDays } from 'date-fns';
import {
  paymentMethodLabelBn,
  paymentMethodLabelEn,
} from '@/lib/report-filters';
import type { GroupBy, ProfitInsights, ProfitReportProps, ProfitSummary, SortKey } from './types';
import { downloadProfitCsv } from './utils';
import { ProfitFilters } from './ProfitFilters';
import { ProfitKpis } from './ProfitKpis';
import { ProfitCharts } from './ProfitCharts';
import { ProfitTable } from './ProfitTable';

export type { ProfitReportProps } from './types';

export function ProfitReport({ onBack }: ProfitReportProps) {
  const t = useTranslations('Reports');
  const { formatPrice, formatNumber, formatStringNumbers, isBn } = useNumberFormat();
  const { inputValue: searchInput, searchQuery, setInputValue: setSearchInput } = useDebouncedSearch();

  const chartConfig = useMemo(
    () =>
      ({
        profit: { label: t('chart_profit'), color: 'var(--chart-2)' },
        revenue: { label: t('chart_revenue'), color: 'var(--chart-1)' },
        margin: { label: t('margin_col'), color: 'var(--chart-3)' },
      }) satisfies ChartConfig,
    [t],
  );

  const [groupBy, setGroupBy] = useState<GroupBy>('orders');
  const [sort, setSort] = useState<SortKey>('profit');
  const [preset, setPreset] = useState('30');
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<ProfitSummary | null>(null);
  const [insights, setInsights] = useState<ProfitInsights | null>(null);

  const dateParams = useMemo(() => {
    const tz = new Date().getTimezoneOffset();
    if (preset !== 'custom') {
      return `days=${preset}&tzOffset=${tz}`;
    }
    return `from=${dateFrom}&to=${dateTo}&tzOffset=${tz}`;
  }, [preset, dateFrom, dateTo]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/reports/profit?groupBy=${groupBy}&sort=${sort}&limit=200&${dateParams}`,
      );
      if (!res.ok) throw new Error(t('profit_load_error'));
      const json = await res.json();
      setRows(json.rows ?? []);
      setSummary(json.summary ?? null);
      setInsights(json.insights ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profit_load_error'));
      setRows([]);
      setSummary(null);
      setInsights(null);
    } finally {
      setLoading(false);
    }
  }, [groupBy, sort, dateParams, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePreset = (p: string) => {
    setPreset(p);
    if (p !== 'custom') {
      const days = parseInt(p);
      setDateFrom(format(subDays(new Date(), days - 1), 'yyyy-MM-dd'));
      setDateTo(format(new Date(), 'yyyy-MM-dd'));
    }
  };

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      if (groupBy === 'orders') {
        return (
          String(r.invoiceNumber || '').toLowerCase().includes(q) ||
          String(r.customerName || '').toLowerCase().includes(q) ||
          String(r.customerPhone || '').includes(q)
        );
      }
      if (groupBy === 'items') {
        return (
          String(r.name || '').toLowerCase().includes(q) ||
          String(r.nameBn || '').includes(searchQuery)
        );
      }
      return (
        String(r.name || '').toLowerCase().includes(q) ||
        String(r.phone || '').includes(q)
      );
    });
  }, [rows, searchQuery, groupBy]);

  const chartData = useMemo(() => {
    return filteredRows.slice(0, 10).map((r) => {
      const label =
        groupBy === 'orders'
          ? String(r.invoiceNumber || '').slice(-8)
          : String(r.name || '').length > 14
            ? String(r.name).slice(0, 14) + '…'
            : String(r.name || '');
      return {
        name: label,
        profit: Number(r.profit || 0),
        revenue: Number(r.revenue || 0),
      };
    });
  }, [filteredRows, groupBy]);

  const payLabel = (method: string) =>
    isBn ? paymentMethodLabelBn(method) : paymentMethodLabelEn(method);

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 bg-muted/20 overflow-y-auto min-h-0 pb-24 animate-page-enter">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              {t('profit_report_title')}
            </h1>
            <p className="text-muted-foreground text-xs">{t('profit_report_subtitle')}</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs h-9"
          onClick={() => downloadProfitCsv(groupBy, filteredRows)}
          disabled={!filteredRows.length}
        >
          <Download className="w-3.5 h-3.5" /> {t('csv')}
        </Button>
      </div>

      <ProfitFilters
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        sort={sort}
        onSortChange={setSort}
        preset={preset}
        onPreset={handlePreset}
        onCustomPreset={() => setPreset('custom')}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        formatStringNumbers={formatStringNumbers}
        t={t}
      />

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">{error}</p>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={fetchData}>
            {t('retry')}
          </Button>
        </div>
      )}

      <ProfitKpis
        loading={loading}
        summary={summary}
        insights={insights}
        formatPrice={formatPrice}
        formatNumber={formatNumber}
        formatStringNumbers={formatStringNumbers}
        t={t}
      />

      <ProfitCharts
        loading={loading}
        chartData={chartData}
        filteredRows={filteredRows}
        groupBy={groupBy}
        summary={summary}
        chartConfig={chartConfig}
        formatStringNumbers={formatStringNumbers}
        t={t}
      />

      <ProfitTable
        groupBy={groupBy}
        loading={loading}
        filteredRows={filteredRows}
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        payLabel={payLabel}
        formatPrice={formatPrice}
        formatNumber={formatNumber}
        formatStringNumbers={formatStringNumbers}
        t={t}
      />
    </div>
  );
}

export default ProfitReport;
