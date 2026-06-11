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
  Package, ShoppingCart, Truck, Calendar, RefreshCw, Dribbble, ArrowUpRight,
  Phone, Mail, MapPin, FileText, ChevronRight
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
import { useSettingsStore } from '@/stores/settings-store';
import { format, subDays } from 'date-fns';

interface SummaryData {
  totalOrdersCount: number;
  pendingOrdersCount: number;
  orderedOrdersCount: number;
  receivedOrdersCount: number;
  cancelledOrdersCount: number;
  receivedPurchasesAmount: number;
  suppliesPurchasesAmount: number;
  totalPurchasesAmount: number;
  totalPaymentsAmount: number;
}

interface ChartPoint {
  date: string;
  amount: number;
  count: number;
}

interface TopSupplier {
  id: string;
  name: string;
  orderCount: number;
  totalAmount: number;
}

interface TopProduct {
  id: string;
  name: string;
  nameBn: string | null;
  quantity: number;
  totalSpent: number;
  avgPrice: number;
}

interface ReportResponse {
  success: boolean;
  summary: SummaryData;
  chartData: ChartPoint[];
  topSuppliers: TopSupplier[];
  topProducts: TopProduct[];
}

interface PurchaseStatisticsProps {
  onBack: () => void;
}

export default function PurchaseStatistics({ onBack }: PurchaseStatisticsProps) {
  const t = useTranslations('Reports');
  const tp = useTranslations('PurchaseOrders');
  const tc = useTranslations('Common');
  
  const { formatPrice, formatStringNumbers, formatDate } = useNumberFormat();
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol);

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

  const chartKey = days === '1' ? 'date' : 'date'; // Hourly uses time/hour label, daily uses date
  const chartColor = '#6366f1'; // Indigo

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

  const yFmt = (v: number) => {
    if (v >= 100000) return `${currencySymbol}${formatStringNumbers((v / 1000).toFixed(0))}k`;
    if (v >= 1000) return `${currencySymbol}${formatStringNumbers((v / 1000).toFixed(1))}k`;
    return `${currencySymbol}${formatStringNumbers(v.toString())}`;
  };

  const tooltipStyle = { borderRadius: '8px', fontSize: '12px' };

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
                <SelectItem value="90">{t('days_90')}</SelectItem>
                <SelectItem value="365">{t('year_1')}</SelectItem>
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
                  {summary && summary.suppliesPurchasesAmount > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      অর্ডার: {formatPrice(summary.receivedPurchasesAmount)} + মালামাল: {formatPrice(summary.suppliesPurchasesAmount)}
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
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={formattedChartData} margin={{ top: 10, right: 5, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="displayLabel" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={yFmt} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={50} />
                    <Tooltip
                      formatter={(v: number) => [formatPrice(v), 'ক্রয় মূল্য']}
                      contentStyle={tooltipStyle}
                      labelStyle={{ fontWeight: 'bold', color: '#1f2937' }}
                    />
                    <Bar dataKey="amount" name="ক্রয় মূল্য" fill={chartColor} radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
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
      {/* Supplier Details Modal */}
      <Dialog open={!!selectedSupplierId} onOpenChange={(open) => { if (!open) { setSelectedSupplierId(null); setSupplierDetail(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-6">
          <DialogHeader className="border-b pb-4">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Truck className="w-5 h-5 text-indigo-600" />
              {loadingDetail ? 'সরবরাহকারীর তথ্য লোড হচ্ছে...' : (supplierDetail?.name || 'সরবরাহকারীর বিবরণ')}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              সরবরাহকারীর প্রোফাইল এবং লেনদেনের বিস্তারিত ইতিহাস
            </DialogDescription>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-sm text-muted-foreground">{tc('loading')}</p>
            </div>
          ) : supplierDetail ? (
            <div className="space-y-6 pt-4">
              {/* Contact Information & Profile */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="rounded-xl border border-slate-100 shadow-xs">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 border-b pb-1">যোগাযোগের তথ্য</h3>
                    {supplierDetail.phone ? (
                      <p className="text-xs flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <Phone className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="font-semibold">ফোন:</span> {formatStringNumbers(supplierDetail.phone)}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5" />
                        <span>ফোন নম্বর নেই</span>
                      </p>
                    )}
                    {supplierDetail.email ? (
                      <p className="text-xs flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <Mail className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="font-semibold">ইমেইল:</span> {supplierDetail.email}
                      </p>
                    ) : null}
                    {supplierDetail.address ? (
                      <p className="text-xs flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="font-semibold">ঠিকানা:</span> {supplierDetail.address}
                      </p>
                    ) : null}
                    {supplierDetail.notes ? (
                      <p className="text-xs flex items-start gap-2 text-slate-600 dark:text-slate-300">
                        <FileText className="w-3.5 h-3.5 text-indigo-500 mt-0.5" />
                        <span><span className="font-semibold">নোট:</span> {supplierDetail.notes}</span>
                      </p>
                    ) : null}
                  </CardContent>
                </Card>

                {/* Financial Summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl border border-slate-100 bg-indigo-50/30 dark:bg-indigo-950/10 flex flex-col justify-center">
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wider">মোট ক্রয়</span>
                    <span className="text-base font-black text-indigo-700 dark:text-indigo-300 mt-1">{formatPrice(supplierDetail.totalPurchases || 0)}</span>
                  </div>
                  <div className="p-3.5 rounded-xl border border-slate-100 bg-emerald-50/30 dark:bg-emerald-950/10 flex flex-col justify-center">
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">মোট পরিশোধ</span>
                    <span className="text-base font-black text-emerald-700 dark:text-emerald-300 mt-1">{formatPrice(supplierDetail.totalPaid || 0)}</span>
                  </div>
                  <div className="col-span-2 p-3.5 rounded-xl border border-red-100 bg-red-50/30 dark:bg-red-950/10 flex flex-col justify-center">
                    <span className="text-[10px] text-red-600 dark:text-red-400 font-semibold uppercase tracking-wider">বকেয়া পাওনা</span>
                    <span className="text-lg font-black text-red-700 dark:text-red-300 mt-1">{formatPrice(supplierDetail.totalDue || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Transaction History Ledger */}
              <div className="space-y-2">
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  লেনদেন ও খাতার হিসাব
                </h3>
                <div className="rounded-xl border overflow-hidden">
                  <div className="max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader className="bg-slate-50/50 sticky top-0 backdrop-blur-md">
                        <TableRow>
                          <TableHead className="w-24 text-xs font-semibold">তারিখ</TableHead>
                          <TableHead className="w-20 text-xs font-semibold">ধরণ</TableHead>
                          <TableHead className="text-xs font-semibold">বিবরণ</TableHead>
                          <TableHead className="text-right text-xs font-semibold">পরিমাণ</TableHead>
                          <TableHead className="text-right text-xs font-semibold">জের (বকেয়া)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {!supplierDetail.ledgerEntries || supplierDetail.ledgerEntries.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs">কোনো লেনদেন পাওয়া যায়নি</TableCell>
                          </TableRow>
                        ) : (
                          supplierDetail.ledgerEntries.map((entry: any) => {
                            const isCredit = entry.entryType === 'credit';
                            return (
                              <TableRow key={entry.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                                <TableCell className="text-xs text-muted-foreground">{formatDate(new Date(entry.createdAt), { day: '2-digit', month: 'short', year: '2-digit' })}</TableCell>
                                <TableCell className="text-xs">
                                  <Badge variant={isCredit ? "secondary" : "default"} className={`text-[10px] px-1.5 py-0 h-5 font-semibold ${isCredit ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-50 border-indigo-200" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-200"}`}>
                                    {isCredit ? 'ক্রয় (Credit)' : 'পরিশোধ (Debit)'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs font-medium max-w-[200px] truncate" title={entry.description}>{entry.description}</TableCell>
                                <TableCell className={`text-right text-xs font-bold ${isCredit ? 'text-indigo-600' : 'text-emerald-600'}`}>
                                  {isCredit ? '+' : '-'}{formatPrice(entry.amount)}
                                </TableCell>
                                <TableCell className="text-right text-xs font-bold text-slate-800 dark:text-slate-200">{formatPrice(entry.balanceAfter)}</TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground text-sm">সরবরাহকারীর কোনো বিবরণ পাওয়া যায়নি।</div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
