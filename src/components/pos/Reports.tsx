'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';

interface SaleChartPoint { date: string; revenue: number; profit: number; count: number; }
interface SummaryData {
  totalRevenue: number; totalProfit: number; totalSalesCount: number;
  revenueGrowth: number; profitMargin: string;
  paymentBreakdown: Record<string, number>;
}
interface StockItem { id: string; name: string; nameBn?: string; category?: string; currentStock: number; minStockLevel: number; unit: string; barcode?: string; }
interface DueCustomer { id: string; name: string; phone?: string; totalDue: number; updatedAt: string; _count?: { sales: number }; }
interface TopProduct { id: string; name: string; nameBn?: string; unit: string; quantity: number; revenue: number; profit: number; }
interface CategoryData { name: string; revenue: number; margin: string; percentage: string; }
interface TopCustomer { id: string; name: string; phone?: string; totalSpent: number; orderCount: number; aov: number; }
interface ProductDetail {
  summary: { totalQty: number; totalRevenue: number; totalProfit: number; profitMargin: string; peakHour: string; peakDay: string; avgOrderQty: number; };
  product: { id: string; name: string; nameBn?: string; unit: string; currentStock: number; minStockLevel: number; };
  dailyTrend: { date: string; revenue: number; qty: number; }[];
  hourlyPattern: { hour: string; qty: number; }[];
  weeklyPattern: { day: string; qty: number; }[];
  topCustomers: { id: string; name: string; phone?: string; qty: number; revenue: number; }[];
}
interface CustomerDetail {
  totalSpent: number; orderCount: number; aov: number;
  monthlyTrend: { month: string; spent: number; }[];
  topProducts: { id: string; name: string; qty: number; revenue: number; }[];
}
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  TrendingUp, TrendingDown, DollarSign, Package, Users,
  AlertTriangle, Download, BarChart2, Lightbulb, ChevronRight, Receipt, ExternalLink
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { format, subDays } from 'date-fns';

type ChartType = 'bar' | 'line';
type DatePreset = '1' | '7' | '30' | '90' | 'custom';

const PAYMENT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

function mergeSmallSlices(data: { name: string; value: number }[], threshold = 0.04) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const main = data.filter(d => d.value / total >= threshold);
  const others = data.filter(d => d.value / total < threshold);
  if (!others.length) return main;
  return [...main, { name: 'Others', value: others.reduce((s, d) => s + d.value, 0) }];
}

const Reports: React.FC<{ onNavigate?: (page: string) => void }> = ({ onNavigate }) => {
  const [salesData, setSalesData] = useState<SaleChartPoint[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [dueData, setDueData] = useState<DueCustomer[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);

  // Per-tab loading & error state
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});
  const [tabError, setTabError] = useState<Record<string, string | null>>({});

  const [chartType, setChartType] = useState<ChartType>('bar');
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<TopCustomer | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [isCustomerDetailLoading, setIsCustomerDetailLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<TopProduct | null>(null);
  const [productDetail, setProductDetail] = useState<ProductDetail | null>(null);
  const [isProductDetailLoading, setIsProductDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('sales');
  const [expensesData, setExpensesData] = useState<any[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);

  const REPORTS_CACHE_TTL = 30 * 60 * 1000;

  const getReportCache = (key: string) => {
    const cached = localStorage.getItem(`reports-cache-${key}`);
    if (!cached) return null;
    try {
      const parsed = JSON.parse(cached);
      if (!parsed?.timestamp || parsed?.data === undefined) return null;
      if (Date.now() - parsed.timestamp > REPORTS_CACHE_TTL) return null;
      return parsed.data;
    } catch (err) {
      console.error('Invalid report cache:', err);
      return null;
    }
  };

  const setReportCache = (key: string, data: any) => {
    localStorage.setItem(`reports-cache-${key}`, JSON.stringify({ data, timestamp: Date.now() }));
  };

  const buildReportCacheKey = (tab: string, params: string) => `${tab}:${params}`;

  const restoreReportCache = (tab: string, cachedData: any) => {
    if (!cachedData) return;
    if (tab === 'sales' || tab === 'payment') {
      setSummaryData(cachedData.summary);
      setSalesData(cachedData.chartData);
    } else if (tab === 'stock') {
      setStockData(cachedData.lowStockItems ?? []);
    } else if (tab === 'dues') {
      setDueData(cachedData.customersWithDues ?? []);
    } else if (tab === 'products') {
      setTopProducts(cachedData.topProducts ?? []);
    } else if (tab === 'categories') {
      setCategoryData(cachedData.categories ?? []);
    } else if (tab === 'customers') {
      setTopCustomers(cachedData.topCustomers ?? []);
    } else if (tab === 'expenses') {
      setExpensesData(cachedData ?? []);
    }
  };

  // Date filter state
  const [preset, setPreset] = useState<DatePreset>('30');
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const isToday = preset === '1';

  const dateParams = useMemo(() => {
    if (preset !== 'custom') {
      const days = parseInt(preset);
      const from = days === 1 ? format(new Date(), 'yyyy-MM-dd') : format(subDays(new Date(), days - 1), 'yyyy-MM-dd');
      const base = `from=${from}&to=${format(new Date(), 'yyyy-MM-dd')}`;
      return days === 1 ? base + '&hourly=true' : base;
    }
    return `from=${customFrom}&to=${customTo}`;
  }, [preset, customFrom, customTo]);

  const fetchTab = useCallback(async (tab: string, params: string, skipLoading = false) => {
    if (!skipLoading) {
      setTabLoading(prev => ({ ...prev, [tab]: true }));
      setTabError(prev => ({ ...prev, [tab]: null }));
    }
    try {
      if (tab === 'sales') {
        const res = await fetch(`/api/reports/sales?${params}`);
        if (!res.ok) throw new Error('Failed to load Sales data');
        const j = await res.json();
        setSummaryData(j.summary);
        setSalesData(j.chartData);
        setReportCache(buildReportCacheKey(tab, params), j);
      } else if (tab === 'payment') {
        const res = await fetch(`/api/reports/sales?${params}`);
        if (!res.ok) throw new Error('Failed to load Payment data');
        const j = await res.json();
        setSummaryData(j.summary);
        setSalesData(j.chartData);
        setReportCache(buildReportCacheKey(tab, params), j);
      } else if (tab === 'stock') {
        const res = await fetch('/api/reports/stock');
        if (!res.ok) throw new Error('Failed to load Stock data');
        const j = await res.json();
        setStockData(j.lowStockItems);
        setReportCache(buildReportCacheKey(tab, params), j);
      } else if (tab === 'dues') {
        const res = await fetch('/api/reports/dues');
        if (!res.ok) throw new Error('Failed to load Dues data');
        const j = await res.json();
        setDueData(j.customersWithDues);
        setReportCache(buildReportCacheKey(tab, params), j);
      } else if (tab === 'products') {
        const res = await fetch(`/api/reports/products?${params}`);
        if (!res.ok) throw new Error('Failed to load Products data');
        const j = await res.json();
        setTopProducts(j.topProducts);
        setReportCache(buildReportCacheKey(tab, params), j);
      } else if (tab === 'categories') {
        const res = await fetch(`/api/reports/categories?${params}`);
        if (!res.ok) throw new Error('Failed to load Categories data');
        const j = await res.json();
        setCategoryData(j.categories);
        setReportCache(buildReportCacheKey(tab, params), j);
      } else if (tab === 'customers') {
        const res = await fetch(`/api/reports/customers?${params}`);
        if (!res.ok) throw new Error('Failed to load Customers data');
        const j = await res.json();
        setTopCustomers(j.topCustomers);
        setReportCache(buildReportCacheKey(tab, params), j);
      }
    } catch (err) {
      setTabError(prev => ({ ...prev, [tab]: err instanceof Error ? err.message : `Failed to load ${tab} data` }));
    } finally {
      if (!skipLoading) {
        setTabLoading(prev => ({ ...prev, [tab]: false }));
      }
    }
  }, []);

  const fetchExpensesReport = useCallback(async (cacheKey: string, skipLoading = false) => {
    if (!skipLoading) {
      setExpensesLoading(true);
    }
    try {
      const res = await fetch('/api/expenses');
      if (!res.ok) throw new Error('Failed to load Expenses data');
      const json = await res.json();
      setExpensesData(json.data ?? []);
      setReportCache(cacheKey, json.data ?? []);
    } catch (err) {
      console.error('Failed to load expenses report data:', err);
    } finally {
      if (!skipLoading) {
        setExpensesLoading(false);
      }
    }
  }, []);

  // date filter বদলালে বা tab বদলালে সবসময় re-fetch
  useEffect(() => {
    const cacheKey = buildReportCacheKey('sales', dateParams);
    const cached = getReportCache(cacheKey);
    if (cached) {
      restoreReportCache('sales', cached);
    }
    fetchTab('sales', dateParams, Boolean(cached));
  }, [dateParams, fetchTab]);

  useEffect(() => {
    if (activeTab === 'sales') return;

    const cacheKey = activeTab === 'expenses'
      ? 'expenses'
      : (activeTab === 'stock' || activeTab === 'dues')
        ? activeTab
        : buildReportCacheKey(activeTab, dateParams);

    const cached = getReportCache(cacheKey);
    if (cached) {
      restoreReportCache(activeTab, cached);
    }

    if (activeTab === 'expenses') {
      fetchExpensesReport(cacheKey, Boolean(cached));
      return;
    }

    if (activeTab === 'stock' || activeTab === 'dues') {
      fetchTab(activeTab, dateParams, Boolean(cached));
      return;
    }

    fetchTab(activeTab, dateParams, Boolean(cached));
  }, [activeTab, dateParams, fetchTab, fetchExpensesReport]);

  const isLoading = tabLoading['sales'] ?? false;
  const errorMessage = tabError[activeTab] ?? null;

  const outstandingDues = useMemo(
    () => dueData?.reduce((acc, c) => acc + c.totalDue, 0).toFixed(2) || '0.00',
    [dueData]
  );

  const paymentBreakdown = useMemo(() => {
    if (!summaryData?.paymentBreakdown) return [];
    return Object.entries(summaryData.paymentBreakdown).map(([name, value]) => ({ name, value: value as number }));
  }, [summaryData]);

  // CSV export — Sales
  const handleExportCSV = useCallback(() => {
    if (!salesData.length) return;
    const header = isToday ? ['Hour', 'Revenue', 'Profit', 'Orders'] : ['Date', 'Revenue', 'Profit', 'Orders'];
    const rows = [
      header,
      ...salesData.map(d => [d.date, d.revenue.toFixed(2), d.profit.toFixed(2), d.count])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [salesData, isToday]);

  const downloadCSV = useCallback((rows: (string | number)[][], filename: string) => {
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const DateFilter = (
    <div className="flex flex-wrap items-end gap-2 shrink-0">
      {(['1', '7', '30', '90'] as DatePreset[]).map(p => (
        <Button
          key={p}
          size="sm"
          variant={preset === p ? 'default' : 'outline'}
          className="min-h-9 text-xs"
          onClick={() => setPreset(p)}
        >
          {p === '1' ? 'Today' : `${p}d`}
        </Button>
      ))}
      <Button
        size="sm"
        variant={preset === 'custom' ? 'default' : 'outline'}
        className="min-h-9 text-xs"
        onClick={() => setPreset('custom')}
      >
        Custom
      </Button>
      {preset === 'custom' && (
        <>
          <div className="flex items-center gap-1">
            <Label className="text-xs shrink-0">From</Label>
            <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-9 text-xs w-36" />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-xs shrink-0">To</Label>
            <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-9 text-xs w-36" />
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/20">
      <div className="shrink-0 border-b bg-background p-4">
        <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
          <TrendingUp className="w-6 h-6" />
          Reports & Analytics
        </h1>
        <p className="text-sm text-muted-foreground">Comprehensive business overview</p>
      </div>

      <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-600">
              <Lightbulb className="w-5 h-5" />
              AI Business Advisor
            </DialogTitle>
            <DialogDescription>
              Personalized business advice based on your current reports.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-muted/30 rounded-xl min-h-25 text-sm whitespace-pre-wrap">
            {isAiLoading ? 'Analyzing your data and generating advice...' : aiAdvice}
          </div>
        </DialogContent>
      </Dialog>

      {errorMessage && (
        <div className="shrink-0 bg-destructive/10 border-b border-destructive/30 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm font-medium text-destructive flex-1">{errorMessage}</p>
          <Button variant="ghost" size="sm" onClick={() => fetchTab(activeTab, dateParams)} className="text-destructive hover:text-destructive min-h-9">Retry</Button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-6 pb-24">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <Card className="rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
              <DollarSign className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-lg md:text-2xl font-bold">₹{summaryData?.totalRevenue?.toFixed(2) || '0.00'}</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {(summaryData?.revenueGrowth ?? 0) >= 0
                  ? <TrendingUp className="w-3 h-3 text-emerald-500" />
                  : <TrendingDown className="w-3 h-3 text-red-500" />}
                <span className={`font-medium ${(summaryData?.revenueGrowth ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {summaryData?.revenueGrowth || '0'}%
                </span>
                <span className="hidden sm:inline"> vs prev period</span>
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Net Profit</CardTitle>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg md:text-2xl font-bold text-emerald-600">₹{summaryData?.totalProfit?.toFixed(2) || '0.00'}</div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="text-emerald-500 font-medium">{summaryData?.profitMargin || '0'}%</span> margin
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Sales</CardTitle>
              <Package className="w-4 h-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg md:text-2xl font-bold">{summaryData?.totalSalesCount || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Invoices</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Dues</CardTitle>
              <Users className="w-4 h-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg md:text-2xl font-bold text-amber-600">₹{outstandingDues}</div>
              <p className="text-xs text-muted-foreground mt-1">To be collected</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="sales" className="w-full" onValueChange={setActiveTab}>
          <div className="w-full overflow-x-auto pb-2">
            <TabsList className="h-auto flex flex-wrap gap-1 bg-muted p-1 rounded-lg w-full sm:w-auto">
              <TabsTrigger className="flex-1 sm:flex-none" value="sales">Sales</TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="payment">Payment</TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="stock">Auto Restock</TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="dues">Dues</TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="products">Top Items</TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="categories">Categories</TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="customers">Customers</TabsTrigger>
              <TabsTrigger className="flex-1 sm:flex-none" value="expenses">Expenses</TabsTrigger>
            </TabsList>
          </div>

          {/* Sales Tab */}
          <TabsContent value="sales">
            <Card className="rounded-xl">
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle>Sales Trend</CardTitle>
                  <CardDescription>{isToday ? 'Hourly sales for today' : 'Daily sales and profit for selected period'}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {DateFilter}
                  <Button variant="outline" size="sm" className="gap-1 min-h-9 border-indigo-200 text-indigo-600 hover:bg-indigo-50" onClick={async () => {
                    if (!summaryData) return;
                    setIsAiDialogOpen(true); setIsAiLoading(true);
                    try {
                      const res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary: summaryData }) });
                      const data = await res.json();
                      setAiAdvice(data.success ? data.advice : 'Sorry, could not fetch AI advice right now.');
                    } catch { setAiAdvice('Sorry, could not fetch AI advice right now.'); }
                    finally { setIsAiLoading(false); }
                  }}>
                    <Lightbulb className="w-4 h-4" /><span className="hidden sm:inline">Ask AI</span>
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 min-h-9" onClick={handleExportCSV}>
                    <Download className="w-4 h-4" /> CSV
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 min-h-9" onClick={() => setChartType(t => t === 'bar' ? 'line' : 'bar')}>
                    <BarChart2 className="w-4 h-4" />{chartType === 'bar' ? 'Line' : 'Bar'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="w-full h-64 md:h-80">
                  {isLoading ? (
                    <div className="w-full h-full flex items-center justify-center border border-dashed rounded-lg">
                      <p className="text-muted-foreground">Loading chart data...</p>
                    </div>
                  ) : salesData?.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      {chartType === 'bar' ? (
                        <BarChart data={salesData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                          <XAxis dataKey="date" tickFormatter={v => isToday ? v : (() => { const d = new Date(v); return `${d.getDate()}/${d.getMonth()+1}`; })()} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                          <YAxis tickFormatter={v => v >= 1000 ? `₹${(v/1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `₹${v}`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
                          <RechartsTooltip formatter={(v: number, n: string) => [`₹${v.toFixed(2)}`, n.charAt(0).toUpperCase()+n.slice(1)]} labelFormatter={l => isToday ? `${l} hrs` : new Date(l).toLocaleDateString()} contentStyle={{ borderRadius: '8px' }} />
                          <Legend wrapperStyle={{ fontSize: '12px' }} />
                          <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4,4,0,0]} maxBarSize={30} />
                          <Bar dataKey="profit" name="Profit" fill="#10b981" radius={[4,4,0,0]} maxBarSize={30} />
                        </BarChart>
                      ) : (
                        <LineChart data={salesData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                          <XAxis dataKey="date" tickFormatter={v => isToday ? v : (() => { const d = new Date(v); return `${d.getDate()}/${d.getMonth()+1}`; })()} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                          <YAxis tickFormatter={v => v >= 1000 ? `₹${(v/1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `₹${v}`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
                          <RechartsTooltip formatter={(v: number, n: string) => [`₹${v.toFixed(2)}`, n.charAt(0).toUpperCase()+n.slice(1)]} labelFormatter={l => isToday ? `${l} hrs` : new Date(l).toLocaleDateString()} contentStyle={{ borderRadius: '8px' }} />
                          <Legend wrapperStyle={{ fontSize: '12px' }} />
                          <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="profit" name="Profit" stroke="#10b981" strokeWidth={2} dot={false} />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center border border-dashed rounded-lg">
                      <p className="text-muted-foreground">No sales data for this period.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payment Breakdown Tab */}
          <TabsContent value="payment">
            <div className="flex flex-wrap gap-2 mb-3">{DateFilter}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle>Payment Method Breakdown</CardTitle>
                  <CardDescription>Revenue by payment method</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="w-full h-64">
                    {paymentBreakdown.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          {(() => { const d = mergeSmallSlices(paymentBreakdown); return (
                          <Pie data={d} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                            {d.map((_, i) => (
                              <Cell key={i} fill={PAYMENT_COLORS[i % PAYMENT_COLORS.length]} />
                            ))}
                          </Pie>
                          ); })()}
                          <RechartsTooltip formatter={(v: number) => `₹${v.toFixed(2)}`} />
                          <Legend wrapperStyle={{ fontSize: '12px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center border border-dashed rounded-lg">
                        <p className="text-muted-foreground">{tabLoading['payment'] || tabLoading['sales'] ? 'Loading...' : 'No data.'}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle>Payment Summary</CardTitle>
                  <CardDescription>Totals per method</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentBreakdown.length > 0 ? paymentBreakdown.map((p, i) => {
                        const total = paymentBreakdown.reduce((s, x) => s + (x.value as number), 0);
                        return (
                          <TableRow key={p.name}>
                            <TableCell className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full inline-block" style={{ background: PAYMENT_COLORS[i % PAYMENT_COLORS.length] }} />
                              {p.name}
                            </TableCell>
                            <TableCell className="text-right font-medium">₹{(p.value as number).toFixed(2)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{total > 0 ? ((p.value as number / total) * 100).toFixed(1) : 0}%</TableCell>
                          </TableRow>
                        );
                      }) : (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                            {tabLoading['payment'] || tabLoading['sales'] ? 'Loading...' : 'No payment data.'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Stock Alerts / Auto Restock Tab */}
          <TabsContent value="stock">
            <Card className="rounded-xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Auto Restock List</CardTitle>
                  <CardDescription>Items at or below minimum stock level</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => {
                  const itemsText = stockData.map(i => `${i.name} - Stock: ${i.currentStock}`).join('\n');
                  const blob = new Blob([itemsText], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `restock-list-${format(new Date(), 'yyyy-MM-dd')}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}>
                  <Download className="w-4 h-4 mr-2" />
                  Download List
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="hidden sm:table-cell text-right">Min Level</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tabLoading['stock'] ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Loading stock data...</TableCell></TableRow>
                      ) : tabError['stock'] ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-6 text-destructive">{tabError['stock']}</TableCell></TableRow>
                      ) : stockData?.length > 0 ? stockData.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            <p className="text-sm">{item.name}</p>
                            {item.nameBn && <p className="text-xs text-muted-foreground">{item.nameBn}</p>}
                          </TableCell>
                          <TableCell className="text-right text-red-500 font-bold">{item.currentStock} {item.unit}</TableCell>
                          <TableCell className="hidden sm:table-cell text-right">{item.minStockLevel} {item.unit}</TableCell>
                          <TableCell className="text-right">
                            {item.currentStock === 0
                              ? <Badge variant="destructive" className="text-xs">Out of Stock</Badge>
                              : <Badge variant="destructive" className="text-xs bg-orange-500 hover:bg-orange-600">Low</Badge>
                            }
                          </TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                            {'✅ All items are well stocked.'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Dues Tab */}
          <TabsContent value="dues">
            <Card className="rounded-xl">
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle>Outstanding Customer Dues</CardTitle>
                  <CardDescription>Customers with pending payments — Total: ₹{outstandingDues}</CardDescription>
                </div>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => downloadCSV(
                  [['Customer','Phone','Total Due','Last Purchase'], ...dueData.map(c => [c.name, c.phone||'', c.totalDue.toFixed(2), new Date(c.updatedAt).toLocaleDateString()])],
                  'dues'
                )}><Download className="w-4 h-4" /> CSV</Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Total Due</TableHead>
                        <TableHead className="hidden sm:table-cell text-right">Last Purchase</TableHead>
                        <TableHead className="hidden sm:table-cell text-right">Orders</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tabLoading['dues'] ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Loading customer dues...</TableCell></TableRow>
                      ) : tabError['dues'] ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-6 text-destructive">{tabError['dues']}</TableCell></TableRow>
                      ) : dueData?.length > 0 ? dueData.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            <p className="text-sm">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.phone || 'N/A'}</p>
                          </TableCell>
                          <TableCell className="text-right text-amber-600 font-bold">₹{c.totalDue.toFixed(2)}</TableCell>
                          <TableCell className="hidden sm:table-cell text-right text-muted-foreground text-xs">{new Date(c.updatedAt).toLocaleDateString()}</TableCell>
                          <TableCell className="hidden sm:table-cell text-right">
                            <Badge variant="outline">{c._count?.sales || 0}</Badge>
                          </TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                            {'✅ No pending dues.'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Top Products Tab */}
          <TabsContent value="products">
            <Card className="rounded-xl">
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle>Top Selling Products</CardTitle>
                  <CardDescription>Best performing items — click any row for detailed report</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {DateFilter}
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => downloadCSV(
                    [['#','Product','Qty Sold','Revenue','Profit'], ...topProducts.map((p,i) => [i+1, p.name, p.quantity, p.revenue.toFixed(2), p.profit.toFixed(2)])],
                    'top-products'
                  )}><Download className="w-4 h-4" /> CSV</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty Sold</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Profit</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tabLoading['products'] ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading products data...</TableCell></TableRow>
                      ) : tabError['products'] ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-6 text-destructive">{tabError['products']}</TableCell></TableRow>
                      ) : topProducts?.length > 0 ? topProducts.map((p, i) => (
                        <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedProduct(p)}>
                          <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                          <TableCell className="font-medium">
                            <p className="text-sm">{p.name}</p>
                            {p.nameBn && <p className="text-xs text-muted-foreground">{p.nameBn}</p>}
                          </TableCell>
                          <TableCell className="text-right">{p.quantity} <span className="text-muted-foreground text-xs">{p.unit}</span></TableCell>
                          <TableCell className="text-right font-medium">₹{p.revenue.toFixed(2)}</TableCell>
                          <TableCell className={`text-right font-medium ${p.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            ₹{p.profit.toFixed(2)}
                          </TableCell>
                          <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                            {'No product data.'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          {/* Categories Tab */}
          <TabsContent value="categories">
            <div className="flex flex-wrap gap-2 mb-3">{DateFilter}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle>Category Revenue</CardTitle>
                  <CardDescription>Sales breakdown by product category</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="w-full h-64">
                    {tabLoading['categories'] ? (
                      <div className="w-full h-full flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>
                    ) : categoryData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          {(() => { const d = mergeSmallSlices(categoryData.map(c => ({ name: c.name, value: c.revenue }))); return (
                          <Pie data={d} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                            {d.map((_, i) => (
                              <Cell key={i} fill={PAYMENT_COLORS[i % PAYMENT_COLORS.length]} />
                            ))}
                          </Pie>
                          ); })()}
                          <RechartsTooltip formatter={(v: number) => `₹${v.toFixed(2)}`} />
                          <Legend wrapperStyle={{ fontSize: '12px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center border border-dashed rounded-lg">
                        <p className="text-muted-foreground">No data.</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle>Category Breakdown</CardTitle>
                  <CardDescription>Revenue, profit & margin per category</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Margin</TableHead>
                          <TableHead className="text-right">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tabLoading['categories'] ? (
                          <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Loading...</TableCell></TableRow>
                        ) : tabError['categories'] ? (
                          <TableRow><TableCell colSpan={4} className="text-center py-6 text-destructive">{tabError['categories']}</TableCell></TableRow>
                        ) : categoryData.length > 0 ? categoryData.map((c, i) => (
                          <TableRow key={c.name}>
                            <TableCell className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{ background: PAYMENT_COLORS[i % PAYMENT_COLORS.length] }} />
                              {c.name}
                            </TableCell>
                            <TableCell className="text-right font-medium">₹{c.revenue.toFixed(2)}</TableCell>
                            <TableCell className="text-right text-emerald-600">{c.margin}%</TableCell>
                            <TableCell className="text-right text-muted-foreground">{c.percentage}%</TableCell>
                          </TableRow>
                        )) : (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                              {'No category data.'}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Expenses Tab */}
          <TabsContent value="expenses">
            <div className="flex flex-wrap gap-2 mb-3">{DateFilter}</div>
            <ExpensesTabContent expenses={expensesData} dateParams={dateParams} onNavigate={onNavigate} isLoading={expensesLoading} />
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers">
            <Card className="rounded-xl">
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle>Top Customers</CardTitle>
                  <CardDescription>Highest spending customers for selected period</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {DateFilter}
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => downloadCSV(
                    [['#','Customer','Phone','Spent','Orders','AOV'], ...topCustomers.map((c,i) => [i+1, c.name, c.phone||'', c.totalSpent.toFixed(2), c.orderCount, c.aov.toFixed(2)])],
                    'top-customers'
                  )}><Download className="w-4 h-4" /> CSV</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Spent</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Orders</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">AOV</TableHead>
                        <TableHead className="text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tabLoading['customers'] ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading customers...</TableCell></TableRow>
                      ) : tabError['customers'] ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-6 text-destructive">{tabError['customers']}</TableCell></TableRow>
                      ) : topCustomers.length > 0 ? topCustomers.map((c, i: number) => (
                        <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedCustomer(c)}>
                          <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                          <TableCell className="font-medium">
                            <p className="text-sm">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.phone || 'N/A'}</p>
                          </TableCell>
                          <TableCell className="text-right font-medium">₹{c.totalSpent.toFixed(2)}</TableCell>
                          <TableCell className="text-right hidden sm:table-cell"><Badge variant="outline">{c.orderCount}</Badge></TableCell>
                          <TableCell className="text-right hidden sm:table-cell text-muted-foreground text-sm">₹{c.aov.toFixed(2)}</TableCell>
                          <TableCell className="text-right"><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                            {'No customer data.'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Product Detail Modal */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => {
        if (!open) { setSelectedProduct(null); setProductDetail(null); }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {selectedProduct?.name}
            </DialogTitle>
            {selectedProduct?.nameBn && <DialogDescription>{selectedProduct.nameBn}</DialogDescription>}
          </DialogHeader>
          <ProductDetailContent
            product={selectedProduct}
            dateParams={dateParams}
            detail={productDetail}
            setDetail={setProductDetail}
            isLoading={isProductDetailLoading}
            setIsLoading={setIsProductDetailLoading}
          />
        </DialogContent>
      </Dialog>

      {/* Customer Detail Modal */}
      <Dialog open={!!selectedCustomer} onOpenChange={(open) => {
        if (!open) { setSelectedCustomer(null); setCustomerDetail(null); }
      }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedCustomer?.name}</DialogTitle>
            <DialogDescription>{selectedCustomer?.phone || 'No phone'}</DialogDescription>
          </DialogHeader>
          <CustomerDetailContent
            customer={selectedCustomer}
            dateParams={dateParams}
            detail={customerDetail}
            setDetail={setCustomerDetail}
            isLoading={isCustomerDetailLoading}
            setIsLoading={setIsCustomerDetailLoading}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

function ProductDetailContent({ product, dateParams, detail, setDetail, isLoading, setIsLoading }: {
  product: TopProduct | null;
  dateParams: string;
  detail: ProductDetail | null;
  setDetail: (d: ProductDetail) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
}) {
  useEffect(() => {
    if (!product) return;
    setIsLoading(true);
    fetch(`/api/reports/products/${product.id}?${dateParams}`)
      .then(r => r.json())
      .then(setDetail)
      .finally(() => setIsLoading(false));
  }, [product?.id, dateParams, setIsLoading, setDetail]);

  if (isLoading) return <div className="py-16 text-center text-muted-foreground">Loading product report...</div>;
  if (!detail || !detail.summary || !detail.product) return null;

  const { summary, product: p, dailyTrend = [], hourlyPattern = [], weeklyPattern = [], topCustomers = [] } = detail;

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Sold', value: `${summary.totalQty} ${p.unit}`, color: 'text-blue-600' },
          { label: 'Revenue', value: `₹${summary.totalRevenue.toFixed(0)}`, color: 'text-primary' },
          { label: 'Profit', value: `₹${summary.totalProfit.toFixed(0)}`, color: summary.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500' },
          { label: 'Margin', value: `${summary.profitMargin}%`, color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="bg-muted/50 rounded-xl p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Peak info + stock */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Peak Hour', value: summary.peakHour },
          { label: 'Peak Day', value: summary.peakDay },
          { label: 'Avg Qty/Order', value: summary.avgOrderQty.toFixed(1) },
          { label: 'Current Stock', value: `${p.currentStock} ${p.unit}`, color: p.currentStock <= p.minStockLevel ? 'text-red-500' : 'text-emerald-600' },
        ].map(s => (
          <div key={s.label} className="border rounded-xl p-3 text-center">
            <p className={`text-base font-semibold ${(s as any).color ?? ''}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Daily Trend */}
      {dailyTrend?.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2">Daily Sales Trend</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyTrend} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="date" tickFormatter={v => { const d = new Date(v); return `${d.getDate()}/${d.getMonth()+1}`; }} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => v >= 1000 ? `₹${(v/1000).toFixed(1)}k` : `₹${v}`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={42} />
                <RechartsTooltip formatter={(v: number, n: string) => [n === 'revenue' ? `₹${v.toFixed(2)}` : v, n === 'revenue' ? 'Revenue' : 'Qty']} labelFormatter={l => new Date(l).toLocaleDateString()} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[3,3,0,0]} maxBarSize={20} />
                <Bar dataKey="qty" name="Qty" fill="#10b981" radius={[3,3,0,0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Weekly + Hourly patterns side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-semibold mb-2">Weekly Pattern</p>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyPattern} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                <RechartsTooltip formatter={(v: number) => [v, 'Qty']} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="qty" fill="#8b5cf6" radius={[3,3,0,0]} maxBarSize={24}>
                  {weeklyPattern.map((entry, i: number) => (
                    <Cell key={i} fill={entry.qty === Math.max(...weeklyPattern.map((w) => w.qty)) ? '#7c3aed' : '#8b5cf6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold mb-2">Hourly Pattern</p>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyPattern} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={3} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                <RechartsTooltip formatter={(v: number) => [v, 'Qty']} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="qty" fill="#f59e0b" radius={[3,3,0,0]} maxBarSize={16}>
                  {hourlyPattern.map((entry, i: number) => (
                    <Cell key={i} fill={entry.qty === Math.max(...hourlyPattern.map((h) => h.qty)) ? '#d97706' : '#f59e0b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Customers */}
      {topCustomers?.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2">Top Customers for This Product</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Qty Bought</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topCustomers.map((c, i: number) => (
                <TableRow key={c.id}>
                  <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{c.name}</p>
                    {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                  </TableCell>
                  <TableCell className="text-right">{c.qty} <span className="text-xs text-muted-foreground">{p.unit}</span></TableCell>
                  <TableCell className="text-right font-medium">₹{c.revenue.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {topCustomers?.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No customer data — all sales were walk-in.</p>
      )}
    </div>
  );
}

function CustomerDetailContent({ customer, dateParams, detail, setDetail, isLoading, setIsLoading }: {
  customer: TopCustomer | null;
  dateParams: string;
  detail: CustomerDetail | null;
  setDetail: (d: CustomerDetail) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
}) {
  useEffect(() => {
    if (!customer) return;
    setIsLoading(true);
    fetch(`/api/reports/customers?customerId=${customer.id}&${dateParams}`)
      .then(r => r.json())
      .then(setDetail)
      .finally(() => setIsLoading(false));
  }, [customer?.id, dateParams, setIsLoading, setDetail]);

  if (isLoading) return <div className="py-10 text-center text-muted-foreground">Loading...</div>;
  if (!detail) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Spent', value: `₹${detail.totalSpent.toFixed(2)}`, color: 'text-primary' },
          { label: 'Orders', value: detail.orderCount, color: '' },
          { label: 'Avg Order', value: `₹${detail.aov.toFixed(2)}`, color: '' },
        ].map(s => (
          <div key={s.label} className="bg-muted rounded-lg p-3 text-center">
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {detail.monthlyTrend?.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Monthly Spending</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={detail.monthlyTrend} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => `₹${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={45} />
                <RechartsTooltip formatter={(v: number) => `₹${v.toFixed(2)}`} contentStyle={{ borderRadius: '8px' }} />
                <Bar dataKey="spent" fill="#3b82f6" radius={[4,4,0,0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {detail.topProducts?.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Top Products</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.topProducts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">{p.name}</TableCell>
                  <TableCell className="text-right text-sm">{p.qty}</TableCell>
                  <TableCell className="text-right text-sm font-medium">₹{p.revenue.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default React.memo(Reports);

const CHART_COLORS = ['#ef4444', '#f59e0b', '#8b5cf6', '#3b82f6', '#10b981', '#ec4899'];
const fp = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n);

function ExpensesTabContent({ expenses, dateParams, onNavigate, isLoading }: {
  expenses: any[];
  dateParams: string;
  onNavigate?: (page: string) => void;
  isLoading?: boolean;
}) {
  // Filter expenses by dateParams range
  const filtered = useMemo(() => {
    const p = new URLSearchParams(dateParams);
    const from = p.get('from') ? new Date(p.get('from')!) : null;
    const to = p.get('to') ? new Date(p.get('to')!) : null;
    if (to) to.setHours(23, 59, 59, 999);
    return expenses.filter(e => {
      const d = new Date(e.date);
      return (!from || d >= from) && (!to || d <= to);
    });
  }, [expenses, dateParams]);

  const total = filtered.reduce((s, e) => s + Number(e.amount ?? 0), 0);

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(e => { map[e.category] = (map[e.category] ?? 0) + Number(e.amount ?? 0); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const pieData = categoryTotals.map(([name, value]) => ({ name, value }));

  const daysDiff = useMemo(() => {
    const p = new URLSearchParams(dateParams);
    const from = p.get('from') ? new Date(p.get('from')!) : null;
    const to = p.get('to') ? new Date(p.get('to')!) : new Date();
    if (!from) return 30;
    return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, [dateParams]);

  const trendData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(e => {
      const k = daysDiff <= 1
        ? format(new Date(e.date), 'HH:00')
        : daysDiff <= 60
        ? format(new Date(e.date), 'dd MMM')
        : format(new Date(e.date), 'MMM yy');
      map[k] = (map[k] ?? 0) + Number(e.amount ?? 0);
    });
    return Object.entries(map).map(([label, amount]) => ({ label, amount }));
  }, [filtered, daysDiff]);

  const trendTitle = daysDiff <= 1 ? 'ঘণ্টাভিত্তিক খরচ' : daysDiff <= 60 ? 'দৈনিক খরচ' : 'মাসিক খরচ';

  const handleDownloadCSV = () => {
    if (!filtered.length) return;
    const rows = [
      ['Date', 'Category', 'Supplier', 'Notes', 'Amount'],
      ...filtered.map(e => [
        format(new Date(e.date), 'dd/MM/yyyy'),
        e.category,
        e.supplierName || '',
        e.notes || '',
        Number(e.amount) || 0,
      ]),
      ['', '', '', 'Total', total],
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="py-16 text-center text-muted-foreground">Loading expenses...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">ফিল্টার সময়ের মোট খরচ: <span className="font-bold text-red-600">{fp(total)}</span> ({filtered.length}টি)</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleDownloadCSV}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          {onNavigate && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs border-red-200 text-red-600 hover:bg-red-50" onClick={() => onNavigate('expenses-report')}>
              <ExternalLink className="w-3.5 h-3.5" /> বিস্তারিত রিপোর্ট
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-xl">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{trendTitle}</CardTitle></CardHeader>
          <CardContent>
            {trendData.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">কোনো ডেটা নেই</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={v => `₹${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={45} />
                  <RechartsTooltip formatter={(v: number) => [fp(v), 'খরচ']} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="amount" fill="#ef4444" radius={[4,4,0,0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardHeader className="pb-2"><CardTitle className="text-sm">ক্যাটাগরি অনুযায়ী</CardTitle></CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">কোনো ডেটা নেই</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}>
                    {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip formatter={(v: number) => fp(v)} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl">
        <CardHeader className="pb-2"><CardTitle className="text-sm">ক্যাটাগরি ব্রেকডাউন</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ক্যাটাগরি</TableHead>
                <TableHead className="text-right">সংখ্যা</TableHead>
                <TableHead className="text-right">মোট</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryTotals.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">কোনো ডেটা নেই</TableCell></TableRow>
              ) : categoryTotals.map(([cat, amt]) => (
                <TableRow key={cat}>
                  <TableCell className="text-sm">{cat}</TableCell>
                  <TableCell className="text-right text-sm">{filtered.filter(e => e.category === cat).length}</TableCell>
                  <TableCell className="text-right font-semibold text-sm">{fp(amt)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{total > 0 ? ((amt/total)*100).toFixed(1) : 0}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
