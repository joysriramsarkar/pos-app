'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { subDays, format } from 'date-fns';
import type { CustomersReportProps } from './types';
import { computeCustomerStats, downloadCustomersCsv } from './utils';
import { CustomersFilters } from './CustomersFilters';
import { CustomersKpis } from './CustomersKpis';
import { CustomersCharts } from './CustomersCharts';
import { CustomersTable } from './CustomersTable';
import { CustomerDetailDialog } from './CustomerDetailDialog';

export type { CustomersReportProps } from './types';

export function CustomersReport({ onBack }: CustomersReportProps) {
  const t = useTranslations('Reports');
  const { formatPrice, formatNumber, formatStringNumbers, formatCompact } = useNumberFormat();

  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { inputValue: searchInput, searchQuery, setInputValue: setSearchInput } = useDebouncedSearch();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState('');
  const [customerDetail, setCustomerDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [preset, setPreset] = useState('7');
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    setLoading(true);
    let url = `/api/reports/customers?from=${dateFrom}&to=${dateTo}T23:59:59&tzOffset=${new Date().getTimezoneOffset()}`;
    if (preset === '1') {
      const today = format(new Date(), 'yyyy-MM-dd');
      url = `/api/reports/customers?from=${today}&to=${today}T23:59:59&hourly=true&tzOffset=${new Date().getTimezoneOffset()}`;
    } else if (preset !== 'custom') {
      url = `/api/reports/customers?days=${preset}&tzOffset=${new Date().getTimezoneOffset()}`;
    }

    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res && res.topCustomers) {
          setCustomers(res.topCustomers ?? []);
        }
      })
      .catch((err) => console.error('Failed to fetch customer stats:', err))
      .finally(() => setLoading(false));
  }, [preset, dateFrom, dateTo]);

  useEffect(() => {
    if (!selectedCustomerId) return;
    setDetailLoading(true);

    let url = `/api/reports/customers?customerId=${selectedCustomerId}&from=${dateFrom}&to=${dateTo}T23:59:59&tzOffset=${new Date().getTimezoneOffset()}`;
    if (preset !== 'custom') {
      url = `/api/reports/customers?customerId=${selectedCustomerId}&days=${preset}&tzOffset=${new Date().getTimezoneOffset()}`;
    }

    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        setCustomerDetail(res);
      })
      .catch((err) => console.error('Failed to load customer details:', err))
      .finally(() => setDetailLoading(false));
  }, [selectedCustomerId, preset, dateFrom, dateTo]);

  const stats = useMemo(() => computeCustomerStats(customers), [customers]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      return (
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.phone || '').includes(searchQuery)
      );
    });
  }, [customers, searchQuery]);

  const chartData = useMemo(() => {
    return [...customers]
      .sort((a, b) => Number(b.profit || 0) - Number(a.profit || 0))
      .slice(0, 10)
      .map((c) => ({
        name: c.name.length > 12 ? c.name.substring(0, 12) + '...' : c.name,
        spent: Number(c.totalSpent),
        profit: Number(c.profit || 0),
      }));
  }, [customers]);

  const handlePresetChange = (p: string) => {
    setPreset(p);
    if (p === '1') {
      const today = format(new Date(), 'yyyy-MM-dd');
      setDateFrom(today);
      setDateTo(today);
    } else if (p !== 'custom') {
      const days = parseInt(p);
      setDateFrom(format(subDays(new Date(), days - 1), 'yyyy-MM-dd'));
      setDateTo(format(new Date(), 'yyyy-MM-dd'));
    }
  };

  const handleRowClick = (c: any) => {
    setSelectedCustomerId(c.id);
    setSelectedCustomerName(c.name);
    setSelectedCustomerPhone(c.phone || 'N/A');
  };

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 bg-slate-50/50 overflow-y-auto min-h-0 pb-24 animate-page-enter">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-500" />
              {t('top_customers')}
            </h1>
            <p className="text-muted-foreground text-xs">{t('highest_spending')}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9" onClick={() => downloadCustomersCsv(filteredCustomers)} disabled={!filteredCustomers.length}>
          <Download className="w-3.5 h-3.5" /> {t('csv')}
        </Button>
      </div>

      <CustomersFilters
        preset={preset}
        onPresetChange={handlePresetChange}
        onCustomPreset={() => setPreset('custom')}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        formatStringNumbers={formatStringNumbers}
        t={t}
      />

      <CustomersKpis
        stats={stats}
        formatPrice={formatPrice}
        formatNumber={formatNumber}
        formatStringNumbers={formatStringNumbers}
        t={t}
      />

      <CustomersCharts
        chartData={chartData}
        formatPrice={formatPrice}
        formatCompact={formatCompact}
        t={t}
      />

      <CustomersTable
        loading={loading}
        filteredCustomers={filteredCustomers}
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        onRowClick={handleRowClick}
        formatPrice={formatPrice}
        formatNumber={formatNumber}
        formatStringNumbers={formatStringNumbers}
        t={t}
      />

      <CustomerDetailDialog
        open={!!selectedCustomerId}
        onOpenChange={(o) => { if (!o) setSelectedCustomerId(null); }}
        customerName={selectedCustomerName}
        customerPhone={selectedCustomerPhone}
        detailLoading={detailLoading}
        customerDetail={customerDetail}
        formatPrice={formatPrice}
        formatNumber={formatNumber}
        formatStringNumbers={formatStringNumbers}
        t={t}
      />
    </div>
  );
}
