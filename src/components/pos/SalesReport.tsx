'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, CalendarDays, Calendar, CalendarRange, ChevronLeft, ChevronRight, Download, BarChart2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, subDays, addDays, subMonths, getWeek, getYear } from 'date-fns';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { useSettingsStore } from '@/stores/settings-store';

type ViewMode = 'daily' | 'weekly' | 'monthly';
type ChartStyle = 'bar' | 'line' | 'area';

interface SalesReportProps {
  onBack: () => void;
}

export function SalesReport({ onBack }: SalesReportProps) {
  const t = useTranslations('Reports');
  const { formatPrice, formatDate, formatNumber, formatStringNumbers } = useNumberFormat();
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol);
  
  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
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
    const url = `/api/reports/sales?from=${fetchFrom}&to=${fetchTo}${hourlyParam}&tzOffset=${new Date().getTimezoneOffset()}`;
    
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res) {
          setData(res.chartData ?? []);
          setSummary(res.summary);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error(err);
      })
      .finally(() => setLoading(false));
      
    return () => controller.abort();
  }, [fetchFrom, fetchTo, viewMode]);

  // Aggregate based on viewMode if not daily (daily is retrieved hourly or already processed)
  const processedChartData = useMemo(() => {
    if (viewMode === 'daily') {
      return data;
    }
    
    // Group weekly or monthly
    const map: Record<string, { label: string; revenue: number; profit: number; count: number; ts: number }> = {};
    
    data.forEach((e) => {
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
        count
      }));
  }, [data, viewMode, t]);

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

  const handleDownloadCSV = () => {
    if (!processedChartData.length) return;
    const header = ['Label / Date', 'Revenue', 'Profit', 'Invoices Count'];
    const rows = [
      header,
      ...processedChartData.map((d) => [
        d.date,
        d.revenue.toFixed(2),
        d.profit.toFixed(2),
        d.count
      ]),
      ['Total', totalRevenue.toFixed(2), totalProfit.toFixed(2), totalCount]
    ];
    
    const csv = rows.map((r: any[]) => r.map((v: any) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setRangePreset = (days: number) => {
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
              <TrendingUp className="w-5 h-5 text-primary" />
              {t('sales_trend')}
            </h1>
            <p className="text-muted-foreground text-xs">{t('subtitle')}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9" onClick={handleDownloadCSV} disabled={!processedChartData.length}>
          <Download className="w-3.5 h-3.5" /> {t('csv')}
        </Button>
      </div>

      {/* Date & View Filters */}
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

          {/* Row 2: Date controls */}
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
                  const last = subMonths(new Date(), 1);
                  setDateFrom(format(startOfMonth(last), 'yyyy-MM-dd'));
                  setDateTo(format(endOfMonth(last), 'yyyy-MM-dd'));
                }}
              >
                {t('last_month') || 'Last Month'}
              </Button>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs w-36" />
              <span className="text-xs text-muted-foreground">–</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs w-36" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="rounded-2xl shadow-sm bg-blue-50/50 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900/30">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">{t('total_revenue')}</p>
            <p className="text-lg md:text-xl font-extrabold text-blue-700 mt-1">{formatPrice(totalRevenue)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">{t('net_profit')}</p>
            <p className="text-lg md:text-xl font-extrabold text-emerald-700 mt-1">{formatPrice(totalProfit)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('total_sales')}</p>
            <p className="text-lg md:text-xl font-extrabold mt-1">{formatNumber(totalCount)} {t('invoices')}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('avg_order') || 'AOV'}</p>
            <p className="text-lg md:text-xl font-extrabold mt-1">{formatPrice(averageOrderValue)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm bg-amber-50/50 dark:bg-amber-950/10 border-amber-100 dark:border-amber-900/30 grid-col-span-2 lg:grid-col-span-1">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-amber-600 tracking-wider">{t('margin')}</p>
            <p className="text-lg md:text-xl font-extrabold text-amber-700 mt-1">{formatNumber(Number(profitMargin.toFixed(1)))}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Recharts Graphical Visualisation */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold">{t('sales_trend')}</CardTitle>
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
            <div className="h-60 w-full flex items-center justify-center">
              <p className="text-muted-foreground text-xs">{t('loading')}</p>
            </div>
          ) : processedChartData.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-12">{t('no_sales_data')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              {chartStyle === 'bar' ? (
                <BarChart data={processedChartData} margin={{ top: 10, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={yFmt} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: any) => [formatPrice(v)]} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                  <Bar dataKey="revenue" name={t('total_revenue')} fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  <Bar dataKey="profit" name={t('net_profit')} fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              ) : chartStyle === 'line' ? (
                <LineChart data={processedChartData} margin={{ top: 10, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={yFmt} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: any) => [formatPrice(v)]} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                  <Line type="monotone" dataKey="revenue" name={t('total_revenue')} stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="profit" name={t('net_profit')} stroke="#10b981" strokeWidth={2.5} dot={{ r: 2 }} />
                </LineChart>
              ) : (
                <AreaChart data={processedChartData} margin={{ top: 10, right: 5, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={yFmt} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: any) => [formatPrice(v)]} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                  <Area type="monotone" dataKey="revenue" name={t('total_revenue')} stroke="#3b82f6" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={2} />
                  <Area type="monotone" dataKey="profit" name={t('net_profit')} stroke="#10b981" fillOpacity={1} fill="url(#colorProfit)" strokeWidth={2} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Sales Logs / Records Table */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t('tab_sales')} {t('revenue_profit_margin')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{viewMode === 'daily' ? t('time') || 'Hour' : t('date') || 'Date'}</TableHead>
                <TableHead className="text-right text-xs">{t('invoices') || 'Invoices'}</TableHead>
                <TableHead className="text-right text-xs">{t('revenue')}</TableHead>
                <TableHead className="text-right text-xs">{t('profit')}</TableHead>
                <TableHead className="text-right text-xs">{t('margin_col')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-xs">{t('loading')}</TableCell>
                </TableRow>
              ) : processedChartData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-xs">{t('no_data')}</TableCell>
                </TableRow>
              ) : (
                processedChartData.map((row) => {
                  const margin = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;
                  return (
                    <TableRow key={row.date} className="hover:bg-muted/30">
                      <TableCell className="text-xs font-medium">{row.date}</TableCell>
                      <TableCell className="text-right text-xs">{formatNumber(row.count)}</TableCell>
                      <TableCell className="text-right text-xs font-semibold">{formatPrice(row.revenue)}</TableCell>
                      <TableCell className="text-right text-xs font-medium text-emerald-600 dark:text-emerald-400">{formatPrice(row.profit)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{formatNumber(Number(margin.toFixed(1)))}%</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
