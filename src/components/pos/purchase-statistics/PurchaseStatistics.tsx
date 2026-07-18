'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft, BarChart2, TrendingUp, TrendingDown,
  Package, ShoppingCart, Truck, Calendar, RefreshCw, ArrowUpRight,
  ChevronRight
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { useTranslations, useLocale } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { format, subDays } from 'date-fns';

import type {
  ReportResponse,
  PurchaseStatisticsProps,
} from './types';
import { SupplierDetailDialog } from './SupplierDetailDialog';

export type { PurchaseStatisticsProps } from './types';

export function PurchaseStatistics({ onBack }: PurchaseStatisticsProps) {
  const t = useTranslations('Reports');
  const locale = useLocale();
  const isBn = locale === 'bn';
  const tp = useTranslations('PurchaseOrders');
  const tc = useTranslations('Common');
  
  const { formatPrice, formatNumber, formatDate, formatStringNumbers, formatCompact } = useNumberFormat();
  const [chartColor] = useState<string>('var(--chart-1)');

  const purchaseChartConfig: ChartConfig = {
    amount: { label: 'ক্রয়', color: 'var(--chart-1)' },
  };

  // Supplier Details Dialog States
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [supplierDetail, setSupplierDetail] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!selectedSupplierId) {
      setSupplierDetail(null);
      return;
    }
    
    setLoadingDetail(true);
    fetch(`/api/suppliers?id=${selectedSupplierId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.success) {
          setSupplierDetail(data.data);
        } else {
          setSupplierDetail(null);
        }
      })
      .catch(err => {
        console.error('Failed to fetch supplier details:', err);
        setSupplierDetail(null);
      })
      .finally(() => {
        setLoadingDetail(false);
      });
  }, [selectedSupplierId]);

  // States
  const [days, setDays] = useState<string>('30');
  const [customFrom, setCustomFrom] = useState<string>(
    format(subDays(new Date(), 29), 'yyyy-MM-dd')
  );
  const [customTo, setCustomTo] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );

  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportResponse | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('tzOffset', new Date().getTimezoneOffset().toString());
      if (days === 'custom') {
        params.set('from', customFrom);
        params.set('to', customTo);
      } else {
        params.set('days', days);
        if (days === '1') {
          params.set('hourly', 'true');
        }
      }
      
      const res = await fetch(`/api/reports/purchases?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setReportData(data);
        } else {
          setReportData(null);
        }
      } else {
        setReportData(null);
      }
    } catch (error) {
      console.error('Failed to fetch purchase report:', error);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }, [days, customFrom, customTo]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const summary = reportData?.summary;
  const chartData = reportData?.chartData || [];
  const topSuppliers = reportData?.topSuppliers || [];
  const topProducts = reportData?.topProducts || [];

  const outstandingDues = useMemo(() => {
    if (!summary) return 0;
    return Math.max(0, summary.totalPurchasesAmount - summary.totalPaymentsAmount);
  }, [summary]);

  const formattedChartData = useMemo(() => {
    return chartData.map(d => {
      let formattedLabel = d.date;
      if (days !== '1' && d.date.includes('-')) {
        try {
          formattedLabel = format(new Date(d.date), 'dd MMM');
        } catch {
          formattedLabel = d.date;
        }
      }
      return {
        ...d,
        displayLabel: formattedLabel,
      };
    });
  }, [chartData, days]);



  return (
    <>
      <div className="flex flex-col gap-4 p-4 md:p-6 bg-slate-50/50 min-h-screen dark:bg-slate-950/20">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-indigo-600" />
              ক্রয় রিপোর্ট ও স্ট্যাটিস্টিকস
            </h1>
            <p className="text-muted-foreground text-xs">ক্রয় এবং সরবরাহকারীদের সংক্রান্ত সামগ্রিক হিসাব-নিকাশ</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchReport} disabled={loading} className="gap-1.5 h-9">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          রিফ্রেশ
        </Button>
      </div>

      {/* Date Filters Card */}
      <Card className="rounded-2xl shadow-sm border-border/40">
        <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex flex-col gap-1.5 min-w-[150px]">
            <Label className="text-xs text-muted-foreground">সময়সীমা</Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t('today_sales_option')}</SelectItem>
                <SelectItem value="7">{t('days_7')}</SelectItem>
                <SelectItem value="30">{t('days_30')}</SelectItem>
                <SelectItem value="365">{t('yearly')}</SelectItem>
                <SelectItem value="custom">{t('custom')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {days === 'custom' && (
            <div className="flex flex-1 items-center gap-3">
              <div className="flex flex-col gap-1.5 flex-1 max-w-[180px]">
                <Label className="text-xs text-muted-foreground">শুরুর তারিখ</Label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <span className="text-xs text-muted-foreground self-end mb-2.5">–</span>
              <div className="flex flex-col gap-1.5 flex-1 max-w-[180px]">
                <Label className="text-xs text-muted-foreground">শেষের তারিখ</Label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-9 text-xs"
                  max={format(new Date(), 'yyyy-MM-dd')}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-sm text-muted-foreground">{tc('loading')}</p>
        </div>
      ) : !reportData ? (
        <Card className="rounded-2xl shadow-sm py-16 text-center">
          <CardContent className="flex flex-col items-center gap-3">
            <Package className="w-12 h-12 text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm">কোনো তথ্য খুঁজে পাওয়া যায়নি।</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Card 1: Total Purchases */}
            <Card className="rounded-2xl shadow-sm bg-gradient-to-br from-indigo-50/50 to-indigo-100/30 dark:from-indigo-950/20 dark:to-indigo-900/10 border-indigo-200/40 dark:border-indigo-800/20">
              <CardContent className="p-4 flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wider">মোট ক্রয়</p>
                  <p className="text-xl font-black text-indigo-700 dark:text-indigo-300">{formatPrice(summary?.totalPurchasesAmount || 0)}</p>
                  {summary && (
                    <p className="text-[10px] text-muted-foreground">
                      মোট অর্ডারকৃত ও প্রাপ্ত মালামালের পরিমাণ
                    </p>
                  )}
                </div>
                <div className="p-2 rounded-xl bg-indigo-100/80 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400">
                  <ShoppingCart className="w-4 h-4" />
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Total Payments */}
            <Card className="rounded-2xl shadow-sm bg-gradient-to-br from-emerald-50/50 to-emerald-100/30 dark:from-emerald-950/20 dark:to-emerald-900/10 border-emerald-200/40 dark:border-emerald-800/20">
              <CardContent className="p-4 flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">মোট পরিশোধ</p>
                  <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">{formatPrice(summary?.totalPaymentsAmount || 0)}</p>
                  <p className="text-[10px] text-muted-foreground">সরবরাহকারীকে দেওয়া অর্থ</p>
                </div>
                <div className="p-2 rounded-xl bg-emerald-100/80 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Outstanding Dues */}
            <Card className="rounded-2xl shadow-sm bg-gradient-to-br from-red-50/50 to-red-100/30 dark:from-red-950/20 dark:to-red-900/10 border-red-200/40 dark:border-red-800/20">
              <CardContent className="p-4 flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] text-red-600 dark:text-red-400 font-semibold uppercase tracking-wider">মোট বকেয়া</p>
                  <p className="text-xl font-black text-red-700 dark:text-red-300">{formatPrice(outstandingDues)}</p>
                  <p className="text-[10px] text-muted-foreground">বকেয়া ক্রয়ের পরিমাণ</p>
                </div>
                <div className="p-2 rounded-xl bg-red-100/80 dark:bg-red-900/50 text-red-600 dark:text-red-400">
                  <TrendingDown className="w-4 h-4" />
                </div>
              </CardContent>
            </Card>

            {/* Card 4: Total Orders */}
            <Card className="rounded-2xl shadow-sm bg-gradient-to-br from-amber-50/50 to-amber-100/30 dark:from-amber-950/20 dark:to-amber-900/10 border-amber-200/40 dark:border-amber-800/20">
              <CardContent className="p-4 flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wider">মোট অর্ডার</p>
                  <p className="text-xl font-black text-amber-700 dark:text-amber-300">{formatStringNumbers(summary?.totalOrdersCount || 0)}</p>
                  {summary && (
                    <p className="text-[10px] text-muted-foreground">
                      প্রাপ্ত: {formatStringNumbers(summary.receivedOrdersCount)} | পেন্ডিং: {formatStringNumbers(summary.pendingOrdersCount + summary.orderedOrdersCount)}
                    </p>
                  )}
                </div>
                <div className="p-2 rounded-xl bg-amber-100/80 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400">
                  <Package className="w-4 h-4" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Trend Chart */}
          <Card className="rounded-2xl shadow-sm border-border/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-indigo-600" />
                {days === '1' ? 'আজকের ক্রয় ট্রেন্ড (ঘণ্টা ভিত্তিক)' : 'ক্রয় ট্রেন্ড (দৈনিক)'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {formattedChartData.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-12">কোনো ক্রয় তথ্য পাওয়া যায়নি।</div>
              ) : (
                <ChartContainer config={purchaseChartConfig} className="h-[240px] w-full">
                  <BarChart data={formattedChartData} margin={{ top: 10, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                    <XAxis dataKey="displayLabel" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={(v) => {
                      if (days === '7') {
                        const d = new Date(v);
                        if (!isNaN(d.getTime())) return d.toLocaleDateString(isBn ? 'bn-BD' : 'en-IN', { weekday: 'short' });
                      }
                      if (days === '365') {
                        const d = new Date(v);
                        if (!isNaN(d.getTime())) return d.toLocaleDateString(isBn ? 'bn-BD' : 'en-IN', { month: 'short', year: '2-digit' });
                      }
                      return formatStringNumbers(v);
                    }} />
                    <YAxis tickFormatter={formatCompact} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={55} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(v) => (
                            <div className="flex items-center justify-between gap-4 min-w-[140px]">
                              <span className="text-muted-foreground text-xs">ক্রয় মূল্য</span>
                              <span className="font-bold tabular-nums">{formatPrice(Number(v))}</span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Bar dataKey="amount" name="ক্রয় মূল্য" fill={chartColor} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Grid: Top Suppliers & Top Products */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Suppliers */}
            <Card className="rounded-2xl shadow-sm border-border/40">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Truck className="w-4 h-4 text-indigo-600" />
                  শীর্ষ সরবরাহকারীসমূহ
                </CardTitle>
                <span className="text-[10px] text-muted-foreground px-2 py-0.5 bg-muted rounded-full font-medium">ক্রয় ভলিউম অনুসারে</span>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-12 text-center">#</TableHead>
                        <TableHead>সরবরাহকারী</TableHead>
                        <TableHead className="text-center">অর্ডার সংখ্যা</TableHead>
                        <TableHead className="text-right">মোট ক্রয়</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topSuppliers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs font-medium">কোনো তথ্য নেই</TableCell>
                        </TableRow>
                      ) : (
                        topSuppliers.map((s, index) => (
                          <TableRow 
                            key={s.id} 
                            className={cn(
                              "hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors", 
                              s.id !== 'none' && "cursor-pointer"
                            )}
                            onClick={() => s.id !== 'none' && setSelectedSupplierId(s.id)}
                          >
                            <TableCell className="text-center text-xs text-muted-foreground font-medium">{formatStringNumbers(index + 1)}</TableCell>
                            <TableCell className="font-semibold text-xs py-2.5">
                              <div className="flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                {s.name}
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-xs font-medium">{formatStringNumbers(s.orderCount)}</TableCell>
                            <TableCell className="text-right text-xs font-bold text-slate-900 dark:text-slate-100">{formatPrice(s.totalAmount)}</TableCell>
                            <TableCell className="text-right text-xs">
                              {s.id !== 'none' && <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Top Purchased Products */}
            <Card className="rounded-2xl shadow-sm border-border/40">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Package className="w-4 h-4 text-indigo-600" />
                  শীর্ষ ক্রয়কৃত পণ্যসমূহ
                </CardTitle>
                <span className="text-[10px] text-muted-foreground px-2 py-0.5 bg-muted rounded-full font-medium">ব্যয় অনুসারে</span>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-12 text-center">#</TableHead>
                        <TableHead>পণ্য</TableHead>
                        <TableHead className="text-center">পরিমাণ</TableHead>
                        <TableHead className="text-right">গড় ক্রয় মূল্য</TableHead>
                        <TableHead className="text-right">মোট ব্যয়</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topProducts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs">কোনো তথ্য নেই</TableCell>
                        </TableRow>
                      ) : (
                        topProducts.map((p, index) => (
                          <TableRow key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                            <TableCell className="text-center text-xs text-muted-foreground font-medium">{formatStringNumbers(index + 1)}</TableCell>
                            <TableCell className="py-2.5">
                              <p className="font-semibold text-xs leading-none">{p.nameBn || p.name}</p>
                              {p.nameBn && p.nameBn !== p.name && (
                                <p className="text-[9px] text-muted-foreground mt-0.5 font-mono">{p.name}</p>
                              )}
                            </TableCell>
                            <TableCell className="text-center text-xs font-medium">{formatStringNumbers(p.quantity)}</TableCell>
                            <TableCell className="text-right text-xs font-medium text-muted-foreground">{formatPrice(p.avgPrice)}</TableCell>
                            <TableCell className="text-right text-xs font-bold text-slate-900 dark:text-slate-100">{formatPrice(p.totalSpent)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
      <SupplierDetailDialog
        selectedSupplierId={selectedSupplierId}
        supplierDetail={supplierDetail}
        loadingDetail={loadingDetail}
        onClose={() => { setSelectedSupplierId(null); setSupplierDetail(null); }}
        formatPrice={formatPrice}
        formatDate={formatDate}
        formatStringNumbers={formatStringNumbers}
        loadingLabel={tc('loading')}
      />
    </>
  );
}

export default PurchaseStatistics;
