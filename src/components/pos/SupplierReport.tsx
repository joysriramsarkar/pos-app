'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Truck, Download, CalendarDays, Calendar, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { useSettingsStore } from '@/stores/settings-store';
import { subDays, addDays, format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

type ViewMode = 'daily' | 'weekly' | 'monthly';
type ChartStyle = 'bar' | 'line' | 'area';

interface SupplierReportProps {
  onBack: () => void;
}

export function SupplierReport({ onBack }: SupplierReportProps) {
  const t = useTranslations('Reports');
  const tPurchase = useTranslations('PurchaseOrders') || (() => 'Purchase Orders');
  const { formatPrice, formatDate, formatNumber, formatStringNumbers } = useNumberFormat();
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol);
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [chartStyle, setChartStyle] = useState<ChartStyle>('bar');
  
  // Date states
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

  const summary = data?.summary || {
    totalOrdersCount: 0,
    pendingOrdersCount: 0,
    orderedOrdersCount: 0,
    receivedOrdersCount: 0,
    cancelledOrdersCount: 0,
    receivedPurchasesAmount: 0,
    totalPurchasesAmount: 0,
    totalPaymentsAmount: 0
  };

  const processedChartData = useMemo(() => {
    const rawChartData = data?.chartData || [];
    if (viewMode === 'daily') {
      return rawChartData;
    }
    
    const map: Record<string, { label: string; amount: number; count: number; ts: number }> = {};
    
    rawChartData.forEach((e: any) => {
      const d = new Date(e.date);
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
        count
      }));
  }, [data, viewMode, t]);

  const topSuppliers = data?.topSuppliers || [];
  const topProducts = data?.topProducts || [];

  const handleDownloadCSV = () => {
    if (!topSuppliers.length && !topProducts.length) return;
    
    // Download top suppliers list
    const header = ['Rank', 'Supplier Name', 'Orders Placed', 'Total Purchases Amount'];
    const rows = [
      header,
      ...topSuppliers.map((s: any, idx: number) => [
        idx + 1,
        s.name,
        s.orderCount,
        s.totalAmount.toFixed(2)
      ])
    ];
    
    const csv = rows.map((r: any[]) => r.map((v: any) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suppliers-purchase-performance-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setRangePreset = (days: number) => {
    setViewMode('weekly'); // Force range view
    setDateFrom(format(subDays(new Date(), days - 1), 'yyyy-MM-dd'));
    setDateTo(format(new Date(), 'yyyy-MM-dd'));
  };

  const yFmt = (v: number) => `${currencySymbol}${v >= 1000 ? formatStringNumbers((v / 1000).toFixed(1)) + 'k' : formatStringNumbers(v)}`;
  const tooltipStyle = { borderRadius: '8px', fontSize: '12px' };

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 bg-slate-50/50 overflow-y-auto min-h-0 pb-24 animate-page-enter">
      {/* Header */}
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
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9" onClick={handleDownloadCSV} disabled={!topSuppliers.length}>
          <Download className="w-3.5 h-3.5" /> {t('csv')}
        </Button>
      </div>

      {/* Date Filters Card */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3 flex flex-col gap-2">
          {/* Row 1: View Modes */}
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={viewMode === 'daily' ? 'default' : 'outline'}
              className="h-8 text-xs flex-1 gap-1"
              onClick={() => setViewMode('daily')}
            >
              <CalendarDays className="w-3.5 h-3.5" /> {t('today')}
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'weekly' ? 'default' : 'outline'}
              className="h-8 text-xs flex-1 gap-1"
              onClick={() => setViewMode('weekly')}
            >
              <Calendar className="w-3.5 h-3.5" /> {t('weekly_pattern')}
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'monthly' ? 'default' : 'outline'}
              className="h-8 text-xs flex-1 gap-1"
              onClick={() => setViewMode('monthly')}
            >
              <CalendarRange className="w-3.5 h-3.5" /> {t('monthly_spending')}
            </Button>
          </div>

          {/* Row 2: Date Range Controls */}
          {viewMode === 'daily' ? (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setSingleDate((d) => format(subDays(new Date(d), 1), 'yyyy-MM-dd'))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant={singleDate === format(new Date(), 'yyyy-MM-dd') ? 'default' : 'outline'}
                className="h-9 flex-1 text-xs font-medium"
                onClick={() => setSingleDate(format(new Date(), 'yyyy-MM-dd'))}
              >
                {singleDate === format(new Date(), 'yyyy-MM-dd') ? t('today') : formatDate(new Date(singleDate), { day: '2-digit', month: 'short', year: 'numeric' })}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-9 p-0"
                disabled={singleDate >= format(new Date(), 'yyyy-MM-dd')}
                onClick={() => setSingleDate((d) => format(addDays(new Date(d), 1), 'yyyy-MM-dd'))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {[7, 30, 90].map((d) => (
                <Button key={d} size="sm" variant="outline" className="h-8 text-xs" onClick={() => setRangePreset(d)}>
                  {formatStringNumbers(d)}d
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  setViewMode('weekly');
                  setDateFrom(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
                  setDateTo(format(new Date(), 'yyyy-MM-dd'));
                }}
              >
                {t('this_month') || 'This Month'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  setViewMode('weekly');
                  const last = subMonths(new Date(), 1);
                  setDateFrom(format(startOfMonth(last), 'yyyy-MM-dd'));
                  setDateTo(format(endOfMonth(last), 'yyyy-MM-dd'));
                }}
              >
                {t('last_month') || 'Last Month'}
              </Button>
              <Input type="date" value={dateFrom} onChange={(e) => { setViewMode('weekly'); setDateFrom(e.target.value); }} className="h-8 text-xs w-36" />
              <span className="text-xs text-muted-foreground">–</span>
              <Input type="date" value={dateTo} onChange={(e) => { setViewMode('weekly'); setDateTo(e.target.value); }} className="h-8 text-xs w-36" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="rounded-2xl shadow-sm bg-blue-50/50 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900/30">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">{t('total_purchases_stock_cost')}</p>
            <p className="text-lg md:text-xl font-extrabold text-blue-700 mt-1">{formatPrice(summary.totalPurchasesAmount)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">{t('supplier_payments_made')}</p>
            <p className="text-lg md:text-xl font-extrabold text-emerald-700 mt-1">{formatPrice(summary.totalPaymentsAmount)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm bg-amber-50/50 dark:bg-amber-950/10 border-amber-100 dark:border-amber-900/30">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-amber-600 tracking-wider">{t('total_purchase_orders')}</p>
            <p className="text-lg md:text-xl font-extrabold text-amber-700 mt-1">{formatNumber(summary.totalOrdersCount)} {t('orders_suffix')}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('active_pending_orders')}</p>
            <p className="text-lg md:text-xl font-extrabold mt-1 text-red-500">
              {formatNumber(summary.orderedOrdersCount + summary.pendingOrdersCount)} {t('pending_suffix')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold">{t('stock_purchasing_trend')}</CardTitle>
          <div className="flex gap-1 bg-muted p-0.5 rounded-lg">
            {(['bar', 'line', 'area'] as ChartStyle[]).map((style) => (
              <Button
                key={style}
                size="sm"
                variant={chartStyle === style ? 'default' : 'ghost'}
                className="h-7 text-[10px] px-2.5 rounded-md"
                onClick={() => setChartStyle(style)}
              >
                {style.toUpperCase()}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-56 w-full flex items-center justify-center">
              <p className="text-muted-foreground text-xs">{t('loading')}</p>
            </div>
          ) : processedChartData.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-12">{t('no_sales_period') || 'No purchases recorded in this period.'}</p>
          ) : (
            <div className="w-full h-56">
              <ResponsiveContainer width="100%" height="100%">
                {chartStyle === 'bar' ? (
                  <BarChart data={processedChartData} margin={{ top: 10, right: 5, left: -25, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={yFmt} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v: any) => [formatPrice(v)]} contentStyle={tooltipStyle} />
                    <Bar dataKey="amount" name={t('total_purchases_stock_cost')} fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={25} />
                  </BarChart>
                ) : chartStyle === 'line' ? (
                  <LineChart data={processedChartData} margin={{ top: 10, right: 5, left: -25, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={yFmt} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v: any) => [formatPrice(v)]} contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="amount" name={t('total_purchases_stock_cost')} stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                ) : (
                  <AreaChart data={processedChartData} margin={{ top: 10, right: 5, left: -25, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorPurchAmt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={yFmt} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v: any) => [formatPrice(v)]} contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="amount" name={t('total_purchases_stock_cost')} stroke="#3b82f6" fillOpacity={1} fill="url(#colorPurchAmt)" strokeWidth={2} />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Side-by-side details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Suppliers List */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t('purchases_by_supplier')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t('supplier_name_col')}</TableHead>
                  <TableHead className="text-right text-xs">{t('orders_placed_col')}</TableHead>
                  <TableHead className="text-right text-xs">{t('total_purchases_col')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-4 text-muted-foreground text-xs">{t('loading')}</TableCell>
                  </TableRow>
                ) : topSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-4 text-muted-foreground text-xs">{t('no_data')}</TableCell>
                  </TableRow>
                ) : (
                  topSuppliers.map((s: any) => (
                    <TableRow key={s.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs font-semibold flex items-center gap-2">
                        <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                        {s.name}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{formatNumber(s.orderCount)}</TableCell>
                      <TableCell className="text-right text-xs font-semibold">{formatPrice(s.totalAmount)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Purchased Products */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t('stock_purchased_items')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t('product')}</TableHead>
                  <TableHead className="text-right text-xs">{t('qty_purchased_col')}</TableHead>
                  <TableHead className="text-right text-xs">{t('avg_price_col')}</TableHead>
                  <TableHead className="text-right text-xs">{t('spent_amount_col')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground text-xs">{t('loading')}</TableCell>
                  </TableRow>
                ) : topProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground text-xs">{t('no_data')}</TableCell>
                  </TableRow>
                ) : (
                  topProducts.map((p: any) => (
                    <TableRow key={p.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs">
                        <p className="font-semibold text-xs">{p.name}</p>
                        {p.nameBn && <p className="text-[10px] text-muted-foreground">{p.nameBn}</p>}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium">{formatNumber(p.quantity)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{formatPrice(p.avgPrice)}</TableCell>
                      <TableCell className="text-right text-xs font-semibold">{formatPrice(p.totalSpent)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
