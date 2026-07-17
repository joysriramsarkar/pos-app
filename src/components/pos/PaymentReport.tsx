'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CreditCard, CalendarDays, Calendar, CalendarRange, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, subDays, addDays, subMonths, getWeek, getYear } from 'date-fns';
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from '@/components/ui/chart';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';

type ViewMode = 'daily' | 'weekly' | 'monthly';
const COLORS = [
  'var(--chart-2)', 'var(--chart-1)', 'var(--chart-3)',
  'var(--chart-4)', 'var(--chart-5)', 'var(--chart-2)',
  'var(--chart-3)', 'var(--chart-1)'
];

interface PaymentReportProps {
  onBack: () => void;
}

export function PaymentReport({ onBack }: PaymentReportProps) {
  const t = useTranslations('Reports');
  const { formatPrice, formatDate, formatNumber, formatStringNumbers, formatCompact } = useNumberFormat();

  const payPieConfig: ChartConfig = {
    value: { label: 'পেমেন্ট', color: 'var(--chart-1)' },
  };
  const payBarConfig: ChartConfig = {
    cash: { label: 'নগদ', color: 'var(--chart-2)' },
    upi: { label: 'UPI', color: 'var(--chart-1)' },
    prepaid: { label: 'Prepaid', color: 'var(--chart-3)' },
  };
  
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
    // Fetch all sales in the date range to calculate detailed payment reports
    // Set a high limit to ensure we capture all data in range for reporting
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

  // Filters
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

  // Aggregated totals — align with dashboard/stats (Mixed not "Split"; fallback cashAmount)
  const summary = useMemo(() => {
    let cash = 0;
    let upi = 0;
    let prepaid = 0;
    let due = 0;
    let total = 0;

    sales.forEach((s) => {
      if (s.status !== 'Completed' && s.status !== 'PartialReturn') return;

      const amtPaid = Number(s.amountPaid || 0);
      const totalAmt = Number(s.totalAmount || 0);
      const method = s.paymentMethod || 'Cash';
      const hasSplit = s.cashAmount != null || s.upiAmount != null;

      total += amtPaid;

      if (hasSplit || method === 'Mixed') {
        const c = Number(s.cashAmount || 0);
        const u = Number(s.upiAmount || 0);
        if (c > 0 || u > 0) {
          cash += c;
          upi += u;
        } else if (method === 'Mixed') {
          cash += amtPaid; // unknown split
        }
      } else if (method === 'Cash') {
        cash += amtPaid;
      } else if (method === 'UPI') {
        upi += amtPaid;
      } else if (method === 'Prepaid') {
        prepaid += amtPaid;
      } else if (method === 'Due') {
        cash += amtPaid; // partial collections typically cash
      }

      if (totalAmt > amtPaid) {
        due += totalAmt - amtPaid;
      }
    });

    return { cash, upi, prepaid, due, total };
  }, [sales]);

  const pieData = useMemo(() => {
    const list = [
      { name: 'Cash', value: summary.cash },
      { name: 'UPI', value: summary.upi },
      { name: 'Prepaid', value: summary.prepaid }
    ];
    return list.filter(item => item.value > 0);
  }, [summary]);

  const trendData = useMemo(() => {
    const map: Record<string, { label: string; cash: number; upi: number; prepaid: number; ts: number }> = {};

    sales.forEach((s) => {
      if (s.status !== 'Completed' && s.status !== 'PartialReturn') return;
      const d = new Date(s.createdAt);

      let k = '';
      let ts = d.getTime();

      if (viewMode === 'daily') {
        k = format(d, 'dd MMM');
      } else if (viewMode === 'weekly') {
        k = `W${getWeek(d)} '${String(getYear(d)).slice(2)}`;
        ts = startOfWeek(d).getTime();
      } else {
        k = format(d, 'MMM yyyy');
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
  }, [sales, viewMode]);

  const handleDownloadCSV = () => {
    if (!filteredSales.length) return;
    const header = ['Invoice No', 'Date', 'Customer', 'Phone', 'Payment Method', 'Total', 'Paid', 'Due Status'];
    const rows = [
      header,
      ...filteredSales.map((s) => [
        s.invoiceNumber,
        format(new Date(s.createdAt), 'dd/MM/yyyy HH:mm'),
        s.customer?.name || 'Walk-in',
        s.customer?.phone || '',
        s.paymentMethod,
        s.totalAmount.toFixed(2),
        s.amountPaid.toFixed(2),
        s.paymentStatus
      ]),
      ['Total', '', '', '', '', '', summary.total.toFixed(2), '']
    ];
    
    const csv = rows.map((r: any[]) => r.map((v: any) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setRangePreset = (days: number) => {
    setDateFrom(format(subDays(new Date(), days - 1), 'yyyy-MM-dd'));
    setDateTo(format(new Date(), 'yyyy-MM-dd'));
  };



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
              <CreditCard className="w-5 h-5 text-indigo-500" />
              {t('payment_breakdown')}
            </h1>
            <p className="text-muted-foreground text-xs">{t('revenue_by_payment')}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9" onClick={handleDownloadCSV} disabled={!filteredSales.length}>
          <Download className="w-3.5 h-3.5" /> {t('csv')}
        </Button>
      </div>

      {/* Date Filters */}
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

      {/* KPI Cards */}
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('payment_summary')}</p>
            <p className="text-lg md:text-xl font-extrabold text-indigo-600 mt-1">{formatPrice(summary.total)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('cash_payments')}</p>
            <p className="text-lg md:text-xl font-extrabold text-emerald-600 mt-1">{formatPrice(summary.cash)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('upi_payments')}</p>
            <p className="text-lg md:text-xl font-extrabold text-blue-600 mt-1">{formatPrice(summary.upi)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t('dues_created')}</p>
            <p className="text-lg md:text-xl font-extrabold text-red-600 mt-1">{formatPrice(summary.due)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Graphical Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pie chart */}
        <Card className="rounded-2xl shadow-sm col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t('payment_breakdown')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-48 w-full flex items-center justify-center"><p className="text-xs text-muted-foreground">{t('loading')}</p></div>
            ) : pieData.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-12">{t('no_data')}</p>
            ) : (
              <ChartContainer config={payPieConfig} className="h-[192px] w-full">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => <span className="font-bold tabular-nums">{formatPrice(Number(v))}</span>} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Bar chart */}
        <Card className="rounded-2xl shadow-sm col-span-1 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t('payment_method_trends')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-48 w-full flex items-center justify-center"><p className="text-xs text-muted-foreground">{t('loading')}</p></div>
            ) : trendData.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-12">{t('no_data')}</p>
            ) : (
              <ChartContainer config={payBarConfig} className="h-[192px] w-full">
                <BarChart data={trendData} margin={{ top: 10, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={formatStringNumbers} />
                  <YAxis tickFormatter={formatCompact} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={55} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => <span className="font-bold tabular-nums">{formatPrice(Number(v))}</span>} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="cash" name="cash" fill="var(--color-cash)" stackId="a" radius={[0, 0, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="upi" name="upi" fill="var(--color-upi)" stackId="a" radius={[0, 0, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="prepaid" name="prepaid" fill="var(--color-prepaid)" stackId="a" radius={[4, 4, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filter and Table List */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-sm font-semibold">{t('payment_summary')}</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative h-8 w-44 md:w-56">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('search_invoice_customer')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-8 h-8 text-xs w-full"
              />
            </div>
            <Select value={filterMethod} onValueChange={setFilterMethod}>
              <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t('all_methods')}</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="Mixed">{t('mixed_payment') || t('split_payment') || 'Mixed'}</SelectItem>
                <SelectItem value="Due">Due</SelectItem>
                <SelectItem value="Prepaid">Prepaid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t('invoice_no')}</TableHead>
                  <TableHead className="text-xs">{t('date')}</TableHead>
                  <TableHead className="text-xs">{t('customer')}</TableHead>
                  <TableHead className="text-xs">{t('payment_method')}</TableHead>
                  <TableHead className="text-right text-xs">{t('total_bill')}</TableHead>
                  <TableHead className="text-right text-xs">{t('paid')}</TableHead>
                  <TableHead className="text-right text-xs">{t('due_col')}</TableHead>
                  <TableHead className="text-right text-xs">{t('status_col')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-6 text-muted-foreground text-xs">{t('loading')}</TableCell>
                  </TableRow>
                ) : filteredSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-6 text-muted-foreground text-xs">{t('no_data')}</TableCell>
                  </TableRow>
                ) : (
                  filteredSales.map((s) => {
                    const totalAmt = Number(s.totalAmount || 0);
                    const amtPaid = Number(s.amountPaid || 0);
                    const dueAmt = Math.max(0, totalAmt - amtPaid);
                    
                    return (
                      <TableRow key={s.id} className="hover:bg-muted/30">
                        <TableCell className="text-xs font-semibold">{s.invoiceNumber}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(new Date(s.createdAt), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</TableCell>
                        <TableCell className="text-xs">
                          <p className="font-medium">{s.customer?.name || t('walk_in_customer')}</p>
                          {s.customer?.phone && <p className="text-[10px] text-muted-foreground">{s.customer.phone}</p>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {s.paymentMethod === 'Mixed' || (Number(s.cashAmount) > 0 && Number(s.upiAmount) > 0) ? (
                            <Badge variant="outline" className="text-[10px]">
                              Mixed (C: {Number(s.cashAmount || 0)} / U: {Number(s.upiAmount || 0)})
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">{s.paymentMethod || 'Cash'}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium">{formatPrice(totalAmt)}</TableCell>
                        <TableCell className="text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400">{formatPrice(amtPaid)}</TableCell>
                        <TableCell className="text-right text-xs font-medium text-red-500">{dueAmt > 0 ? formatPrice(dueAmt) : '—'}</TableCell>
                        <TableCell className="text-right text-xs">
                          <Badge variant={s.paymentStatus === 'Paid' ? 'default' : s.paymentStatus === 'Partial' ? 'secondary' : 'destructive'} className="text-[10px]">
                            {s.paymentStatus}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
