'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { format, startOfMonth, startOfWeek, subDays, getISOWeek, getISOWeekYear } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import type { ExpensesReportProps, ViewMode } from './types';
import { getExpensesReportCache, parseDateSafe, setExpensesReportCache } from './utils';
import { ExpensesFilters } from './ExpensesFilters';
import { ExpensesKpis } from './ExpensesKpis';
import { ExpensesCharts } from './ExpensesCharts';
import { ExpensesTables } from './ExpensesTables';

export type { ExpensesReportProps } from './types';

export function ExpensesReport({ onBack }: ExpensesReportProps) {
  const t = useTranslations('Expenses');
  const { formatPrice, formatDate, formatStringNumbers, formatCompact } = useNumberFormat();

  const [expenses, setExpenses] = useState<any[]>([]);
  const [filterCategory, setFilterCategory] = useState('All');
  const [viewMode, setViewMode] = useState<ViewMode>('daily');

  const [singleDate, setSingleDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const fetchFrom = viewMode === 'daily' ? singleDate : dateFrom;
  const fetchTo = viewMode === 'daily' ? singleDate : dateTo;

  useEffect(() => {
    const cacheKey = `${fetchFrom}:${fetchTo}`;
    const cached = getExpensesReportCache(cacheKey);
    if (cached) {
      setExpenses(cached);
    }

    const controller = new AbortController();

    fetch(`/api/expenses?dateFrom=${fetchFrom}&dateTo=${fetchTo}T23:59:59`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setExpenses(d.data ?? []);
          setExpensesReportCache(cacheKey, d.data ?? []);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error(err);
      });

    return () => controller.abort();
  }, [fetchFrom, fetchTo]);

  const filtered = useMemo(() =>
    expenses.filter((e) => filterCategory === 'All' || e.category === filterCategory),
  [expenses, filterCategory]);

  const total = useMemo(() => filtered.reduce((s, e) => s + Number(e.amount ?? 0), 0), [filtered]);

  const dailyData = useMemo(() => {
    const map: Record<string, { amount: number; ts: number }> = {};
    filtered.forEach((e) => {
      const d = parseDateSafe(e.date);
      const k = formatDate(d, { day: '2-digit', month: 'short' });
      if (!map[k]) map[k] = { amount: 0, ts: d.getTime() };
      map[k].amount += Number(e.amount ?? 0);
    });
    return Object.entries(map).sort((a, b) => a[1].ts - b[1].ts).map(([date, { amount }]) => ({ date, amount }));
  }, [filtered, formatDate]);

  const weeklyData = useMemo(() => {
    const map: Record<string, { amount: number; ts: number }> = {};
    filtered.forEach((e) => {
      const d = parseDateSafe(e.date);
      const k = formatStringNumbers(`W${getISOWeek(d)} '${String(getISOWeekYear(d)).slice(2)}`);
      if (!map[k]) map[k] = { amount: 0, ts: startOfWeek(d).getTime() };
      map[k].amount += Number(e.amount ?? 0);
    });
    return Object.entries(map).sort((a, b) => a[1].ts - b[1].ts).map(([week, { amount }]) => ({ week, amount }));
  }, [filtered, formatStringNumbers]);

  const monthlyData = useMemo(() => {
    const map: Record<string, { amount: number; ts: number }> = {};
    filtered.forEach((e) => {
      const d = parseDateSafe(e.date);
      const k = formatDate(d, { month: 'short', year: 'numeric' });
      if (!map[k]) map[k] = { amount: 0, ts: startOfMonth(d).getTime() };
      map[k].amount += Number(e.amount ?? 0);
    });
    return Object.entries(map).sort((a, b) => a[1].ts - b[1].ts).map(([month, { amount }]) => ({ month, amount }));
  }, [filtered, formatDate]);

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((e) => { map[e.category] = (map[e.category] ?? 0) + Number(e.amount ?? 0); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]) as [string, number][];
  }, [filtered]);

  const pieData = categoryTotals.map(([name, value]) => ({ name, value }));

  const supplierTotals = useMemo(() => {
    const map: Record<string, { name: string; total: number }> = {};
    filtered.filter((e) => e.supplierName).forEach((e) => {
      const k = e.supplierId || e.supplierName;
      if (!map[k]) map[k] = { name: e.supplierName, total: 0 };
      map[k].total += Number(e.amount ?? 0);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const chartColor = viewMode === 'daily' ? 'var(--chart-5)' : viewMode === 'weekly' ? 'var(--chart-3)' : 'var(--chart-1)';
  const tableColor = viewMode === 'daily' ? 'text-red-600' : viewMode === 'weekly' ? 'text-amber-600' : 'text-purple-600';

  const chartData = viewMode === 'daily'
    ? filtered.map((e) => ({ time: formatStringNumbers(format(parseDateSafe(e.date), 'hh:mm a')), amount: e.amount ?? 0, label: e.notes || (e.notes ? '' : e.category), origDate: e.date }))
    : viewMode === 'weekly' ? weeklyData : monthlyData;
  const chartKey = viewMode === 'daily' ? 'time' : viewMode === 'weekly' ? 'week' : 'month';

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 bg-slate-50/50 overflow-y-auto min-h-0 pb-24 animate-page-enter">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="w-5 h-5" /> {t('report_title')}
          </h1>
          <p className="text-muted-foreground text-xs">{t('report_analysis')}</p>
        </div>
      </div>

      <ExpensesFilters
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        singleDate={singleDate}
        onSingleDateChange={setSingleDate}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        filterCategory={filterCategory}
        onFilterCategoryChange={setFilterCategory}
        formatDate={formatDate}
        formatStringNumbers={formatStringNumbers}
        t={t}
      />

      <ExpensesKpis
        total={total}
        filteredCount={filtered.length}
        dailyDataLength={dailyData.length}
        viewMode={viewMode}
        formatPrice={formatPrice}
        formatStringNumbers={formatStringNumbers}
        t={t}
      />

      <ExpensesCharts
        viewMode={viewMode}
        chartData={chartData}
        chartKey={chartKey}
        chartColor={chartColor}
        pieData={pieData}
        categoryTotals={categoryTotals}
        total={total}
        formatPrice={formatPrice}
        formatStringNumbers={formatStringNumbers}
        formatCompact={formatCompact}
        t={t}
      />

      <ExpensesTables
        viewMode={viewMode}
        filtered={filtered}
        chartData={chartData}
        chartKey={chartKey}
        tableColor={tableColor}
        singleDate={singleDate}
        supplierTotals={supplierTotals}
        formatPrice={formatPrice}
        formatDate={formatDate}
        formatStringNumbers={formatStringNumbers}
        t={t}
      />
    </div>
  );
}

export default ExpensesReport;
