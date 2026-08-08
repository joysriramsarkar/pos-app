'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CreditCard, Download } from 'lucide-react';
import { format, startOfMonth, startOfWeek, subDays, getWeek, getYear } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import type { PaymentReportProps, ViewMode } from './types';
import { computePaymentSummary, downloadPaymentsCsv } from './utils';
import { PaymentFilters } from './PaymentFilters';
import { PaymentKpis } from './PaymentKpis';
import { PaymentCharts } from './PaymentCharts';
import { PaymentTable } from './PaymentTable';

export type { PaymentReportProps } from './types';

export function PaymentReport({ onBack }: PaymentReportProps) {
  const t = useTranslations('Reports');
  const { formatPrice, formatDate, formatStringNumbers, formatCompact } = useNumberFormat();

  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { inputValue: searchInput, searchQuery, setInputValue: setSearchInput } = useDebouncedSearch();
  const [filterMethod, setFilterMethod] = useState('All');

  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [singleDate, setSingleDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const fetchFrom = viewMode === 'daily' ? singleDate : dateFrom;
  const fetchTo = viewMode === 'daily' ? singleDate : dateTo;

  useEffect(() => {
    setLoading(true);
    const url = `/api/sales?dateFrom=${fetchFrom}&dateTo=${fetchTo}T23:59:59&limit=5000`;

    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res && res.success) {
          setSales(res.data ?? []);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error(err);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [fetchFrom, fetchTo]);

  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const matchesSearch =
        s.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.customer?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.customer?.phone || '').includes(searchQuery);

      const matchesMethod =
        filterMethod === 'All' ||
        s.paymentMethod === filterMethod ||
        (filterMethod === 'Mixed' &&
          (s.paymentMethod === 'Mixed' ||
            (Number(s.cashAmount) > 0 && Number(s.upiAmount) > 0)));

      return matchesSearch && matchesMethod;
    });
  }, [sales, searchQuery, filterMethod]);

  const summary = useMemo(() => computePaymentSummary(sales), [sales]);

  const pieData = useMemo(() => {
    const list = [
      { name: t('cash'), value: summary.cash },
      { name: t('upi'), value: summary.upi },
      { name: t('prepaid'), value: summary.prepaid },
    ];
    return list.filter((item) => item.value > 0);
  }, [summary, t]);

  const trendData = useMemo(() => {
    const map: Record<string, { label: string; cash: number; upi: number; prepaid: number; ts: number }> = {};

    sales.forEach((s) => {
      if (s.status !== 'Completed' && s.status !== 'PartialReturn') return;
      const d = new Date(s.createdAt);

      let k = '';
      let ts = d.getTime();

      if (viewMode === 'daily') {
        k = formatDate(d, { day: '2-digit', month: 'short' });
      } else if (viewMode === 'weekly') {
        k = formatStringNumbers(`W${getWeek(d)} '${String(getYear(d)).slice(2)}`);
        ts = startOfWeek(d).getTime();
      } else {
        k = formatDate(d, { month: 'short', year: 'numeric' });
        ts = startOfMonth(d).getTime();
      }

      if (!map[k]) {
        map[k] = { label: k, cash: 0, upi: 0, prepaid: 0, ts };
      }

      const amtPaid = Number(s.amountPaid || 0);
      const method = s.paymentMethod || 'Cash';
      const c = Number(s.cashAmount || 0);
      const u = Number(s.upiAmount || 0);

      if (method === 'Cash') {
        map[k].cash += c > 0 || u > 0 ? c : amtPaid;
      } else if (method === 'UPI') {
        map[k].upi += c > 0 || u > 0 ? u : amtPaid;
      } else if (method === 'Mixed') {
        if (c > 0 || u > 0) {
          map[k].cash += c;
          map[k].upi += u;
        } else {
          map[k].cash += amtPaid;
        }
      } else if (method === 'Prepaid') {
        map[k].prepaid += amtPaid;
      } else if (method === 'Due') {
        map[k].cash += amtPaid;
      }
    });

    return Object.values(map).sort((a, b) => a.ts - b.ts);
  }, [sales, viewMode, formatDate, formatStringNumbers]);

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 bg-slate-50/50 overflow-y-auto min-h-0 pb-24 animate-page-enter">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-indigo-500" />
              {t('payment_breakdown')}
            </h1>
            <p className="text-muted-foreground text-xs">{t('revenue_by_payment')}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9" onClick={() => downloadPaymentsCsv(filteredSales, summary)} disabled={!filteredSales.length}>
          <Download className="w-3.5 h-3.5" /> {t('csv')}
        </Button>
      </div>

      <PaymentFilters
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

      <PaymentKpis summary={summary} formatPrice={formatPrice} t={t} />

      <PaymentCharts
        loading={loading}
        pieData={pieData}
        trendData={trendData}
        formatPrice={formatPrice}
        formatStringNumbers={formatStringNumbers}
        formatCompact={formatCompact}
        t={t}
      />

      <PaymentTable
        loading={loading}
        filteredSales={filteredSales}
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        filterMethod={filterMethod}
        onFilterMethodChange={setFilterMethod}
        formatPrice={formatPrice}
        formatDate={formatDate}
        t={t}
      />
    </div>
  );
}
