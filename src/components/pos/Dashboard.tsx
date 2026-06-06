'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  Wallet,
  AlertTriangle,
  ShoppingCart,
  Plus,
  Package,
  Users,
  IndianRupee,
  ArrowUpRight,
  Clock,
  Receipt,
  CircleDollarSign,
  Sun,
  Moon,
  CloudSun,
  Stars,
  ArrowUp,
  ArrowDown,
  Search,
  X,
  Banknote,
  Minus,
  Smartphone,
  CreditCard,
  FileText,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useCartStore, useProductsStore, useSalesStore } from '@/stores/pos-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useToast } from '@/hooks/use-toast';
import { useNumberFormat } from '@/hooks/use-number-format';
import DailySummary from '@/components/pos/DailySummary';
import { TransactionDetailsDialog } from '@/components/pos/transaction-history/TransactionDetailsDialog';
import type { Transaction } from '@/components/pos/transaction-history/types';
import type { Product, Sale } from '@/types/pos';
import { STORE_CONFIG } from '@/types/pos';

interface Last7DayData {
  date: string;
  day: string;
  sales: number;
  expenses: number;
}

interface StatsData {
  todaySales: number;
  todayOrders: number;
  todayCash: number;
  todayUpi: number;
  todayExpenses: number;
  totalDue: number;
  lowStockCount: number;
  lowStockProducts: {
    id: string;
    name: string;
    nameBn: string;
    currentStock: number;
    minStockLevel: number;
  }[];
  recentTransactions: Transaction[];
  paymentBreakdown: {
    'নগদ': number;
    'ইউপিআই': number;
    'মিশ্র': number;
    'বাকি': number;
  };
  totalProducts: number;
  totalCustomers: number;
  todayProfit: number;
  last7DaysSales: Last7DayData[];
  profitMargin: number;
  yesterdaySales: number;
  yesterdayOrders: number;
  yesterdayExpenses: number;
}

const chartConfig = {
  sales: {
    label: 'বিক্রয়',
    color: 'hsl(var(--chart-1))',
  },
  expenses: {
    label: 'খরচ',
    color: 'hsl(var(--chart-3))',
  },
} satisfies ChartConfig;

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const t = useTranslations('Dashboard');
  const tBilling = useTranslations('Billing');
  const { formatPrice, formatDate, formatNumber } = useNumberFormat();
  const { settings } = useSettingsStore();
  const products = useProductsStore((state) => state.products);
  const sales = useSalesStore((state) => state.sales);

  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [searchOpen, setSearchOpen] = useState(false);
  const [dailySummaryOpen, setDailySummaryOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [prevStats, setPrevStats] = useState<StatsData | null>(null);
  const [numberPopping, setNumberPopping] = useState(false);

  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  // Sync refresh on transaction history update
  useEffect(() => {
    fetchStats();
  }, [sales]);

  // Number pop animation when stats change
  useEffect(() => {
    if (stats && prevStats && (
      stats.todaySales !== prevStats.todaySales ||
      stats.todayOrders !== prevStats.todayOrders ||
      stats.todayProfit !== prevStats.todayProfit
    )) {
      setNumberPopping(true);
      const timer = setTimeout(() => setNumberPopping(false), 300);
      return () => clearTimeout(timer);
    }
    if (stats) {
      setPrevStats(stats);
    }
  }, [stats]);

  // Auto-update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Focus search input when dialog opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSearchTerm('');
    }
  }, [searchOpen]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/stats?tzOffset=${new Date().getTimezoneOffset()}`);
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const formatTaka = (amount: number) => formatPrice(amount);

  // Calculate yesterday comparison percentage
  const getComparison = useCallback((todayVal: number, yesterdayVal: number): { pct: number; direction: 'up' | 'down' | 'same' } | null => {
    if (yesterdayVal <= 0) return null;
    const diff = todayVal - yesterdayVal;
    const pct = Math.round((diff / yesterdayVal) * 100);
    if (pct > 0) return { pct, direction: 'up' };
    if (pct < 0) return { pct: Math.abs(pct), direction: 'down' };
    return { pct: 0, direction: 'same' };
  }, []);

  // Search results for mobile quick search
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return products
      .filter((p) => p.isActive && (
        p.name.toLowerCase().includes(term) ||
        p.nameBn?.toLowerCase().includes(term) ||
        (p.barcode && p.barcode.includes(term))
      ))
      .slice(0, 8);
  }, [products, searchTerm]);

  const handleSearchSelect = useCallback((product: Product) => {
    if (product.currentStock <= 0) return;
    useCartStore.getState().addItem(product, 1);
    setSearchOpen(false);
    setSearchTerm('');
    onNavigate?.('billing');
    toast({
      description: t('product_added_to_cart'),
      duration: 2000,
    });
  }, [onNavigate, toast, t]);

  // Bengali greeting based on time of day
  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour >= 5 && hour < 12) return t('good_morning');
    if (hour >= 12 && hour < 17) return t('good_afternoon');
    if (hour >= 17 && hour < 21) return t('good_evening');
    return t('good_night');
  };

  const getGreetingIcon = () => {
    const hour = currentTime.getHours();
    if (hour >= 5 && hour < 12) return <Sun className="h-5 w-5 text-amber-500" />;
    if (hour >= 12 && hour < 17) return <CloudSun className="h-5 w-5 text-orange-500" />;
    if (hour >= 17 && hour < 21) return <Moon className="h-5 w-5 text-indigo-500" />;
    return <Stars className="h-5 w-5 text-purple-500" />;
  };

  // Bengali date formatting
  const getBengaliDate = () => {
    const bengaliDays = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
    const dayName = bengaliDays[currentTime.getDay()];
    const date = formatDate(currentTime, { day: 'numeric' });
    const month = formatDate(currentTime, { month: 'long' });
    const year = formatDate(currentTime, { year: 'numeric' });
    return `${date} ${month} ${year}, ${dayName}`;
  };

  const getTimeAgo = (dateVal: string | Date) => {
    const now = new Date();
    const date = new Date(dateVal);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return t('just_now');
    if (diffMins < 60) return t('minutes_ago', { count: diffMins });
    if (diffHours < 24) return t('hours_ago', { count: diffHours });
    return formatDate(date);
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  const cashAmount = stats?.paymentBreakdown?.['নগদ'] ?? stats?.todayCash ?? 0;
  const upiAmount = stats?.paymentBreakdown?.['ইউপিআই'] ?? stats?.todayUpi ?? 0;
  const dueAmount = stats?.paymentBreakdown?.['বাকি'] ?? 0;
  const profitValue = stats?.todayProfit ?? 0;
  const isProfitPositive = profitValue >= 0;

  // Yesterday comparisons
  const salesComparison = getComparison(stats?.todaySales ?? 0, stats?.yesterdaySales ?? 0);
  const ordersComparison = getComparison(stats?.todayOrders ?? 0, stats?.yesterdayOrders ?? 0);
  const expensesComparison = getComparison(stats?.todayExpenses ?? 0, stats?.yesterdayExpenses ?? 0);

  // Chart data - use last7DaysSales from API
  const chartData = stats?.last7DaysSales?.map((d) => ({
    date: d.day?.substring(0, 3) || d.date,
    sales: d.sales,
    expenses: d.expenses,
  })) ?? [];

  return (
    <div className="space-y-3 p-3 md:p-4 animate-page-enter overflow-y-auto h-full">
      {/* Mobile Quick Search - only visible on mobile */}
      <div className="md:hidden">
        <button
          className="w-full flex items-center gap-3 h-11 px-4 rounded-xl border bg-muted/30 text-muted-foreground text-sm touch-feedback"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-4 w-4 shrink-0" />
          <span>{t('quick_search')}</span>
        </button>
      </div>

      {/* Mobile Search Dialog */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="top-[10%] translate-y-0 max-w-lg p-0 gap-0">
          <DialogHeader className="sr-only">
            <DialogTitle>{t('quick_search')}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              ref={searchInputRef}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('quick_search')}
              className="border-0 shadow-none focus-visible:ring-0 px-0 text-base"
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => setSearchTerm('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="border-t" />
          <div className="max-h-[60vh] overflow-y-auto">
            {searchTerm.trim() === '' ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t('quick_search')}
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-8 text-center">
                <Package className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t('no_results')}</p>
              </div>
            ) : (
              <div>
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
                  {t('search_results')}
                </div>
                {searchResults.map((product) => {
                  const isOutOfStock = product.currentStock <= 0;
                  return (
                    <button
                      key={product.id}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors touch-feedback ${
                        isOutOfStock ? 'opacity-50' : ''
                      }`}
                      onClick={() => handleSearchSelect(product)}
                      disabled={isOutOfStock}
                    >
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isOutOfStock
                          ? 'bg-red-100 dark:bg-red-900/20'
                          : 'bg-emerald-100 dark:bg-emerald-900/20'
                      }`}>
                        <Package className={`h-4 w-4 ${
                          isOutOfStock
                            ? 'text-red-500'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {product.nameBn || product.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isOutOfStock
                            ? tBilling('out_of_stock')
                            : `${tBilling('stock')}: ${product.currentStock} ${product.unit}`
                          }
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-primary">{formatTaka(product.sellingPrice)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Greeting & Date/Time Header - with card background */}
      <Card className="bg-gradient-to-r from-primary/5 via-primary/3 to-transparent dark:from-primary/10 dark:via-primary/5 dark:to-transparent border-primary/10 shadow-sm">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
              {getGreetingIcon()}
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold">{getGreeting()}, {settings.store_name_bn || 'লক্ষ্মণ ভাণ্ডার'}</h2>
              <p className="text-sm text-muted-foreground">{getBengaliDate()} · {t('greeting_card_subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background/60 dark:bg-background/30 rounded-lg px-3 py-1.5">
            <Clock className="h-4 w-4" />
            <span>
              {formatDate(currentTime, { hour: '2-digit', minute: '2-digit' })}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="ml-2 h-8 gap-1.5 text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10 hover:text-primary animate-pulse"
              onClick={() => setDailySummaryOpen(true)}
            >
              <FileText className="h-3.5 w-3.5" />
              {t('end_of_day')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards - 5 cards, responsive grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <StatCard
          title={t('today_sales')}
          value={formatTaka(stats?.todaySales ?? 0)}
          icon={<TrendingUp className="h-5 w-5 text-white" />}
          iconBg="bg-gradient-to-br from-green-500 to-emerald-600 shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
          cardGradient="from-green-50/50 to-transparent dark:from-green-950/30 dark:to-transparent"
          trend={stats && stats.todaySales > 0 ? 'up' : undefined}
          comparison={salesComparison}
          comparisonLabel={t('vs_yesterday')}
          staggerDelay={0}
          numberPopping={numberPopping}
        />
        <StatCard
          title={t('today_profit')}
          value={formatTaka(Math.abs(profitValue))}
          icon={<CircleDollarSign className="h-5 w-5 text-white" />}
          iconBg="bg-gradient-to-br from-emerald-500 to-teal-600 shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
          cardGradient="from-emerald-50/50 to-transparent dark:from-emerald-950/30 dark:to-transparent"
          trend={isProfitPositive ? 'up' : profitValue < 0 ? 'down' : undefined}
          trendLabel={isProfitPositive ? '' : '−'}
          profitMargin={stats?.profitMargin}
          staggerDelay={1}
          numberPopping={numberPopping}
        />
        <StatCard
          title={t('total_due')}
          value={formatTaka(stats?.totalDue ?? 0)}
          icon={<Wallet className="h-5 w-5 text-white" />}
          iconBg="bg-gradient-to-br from-orange-500 to-amber-600 shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
          cardGradient="from-orange-50/50 to-transparent dark:from-orange-950/30 dark:to-transparent"
          trend={stats && stats.totalDue > 0 ? 'down' : undefined}
          staggerDelay={2}
          numberPopping={numberPopping}
        />
        <StatCard
          title={t('low_stock')}
          value={`${stats?.lowStockCount ?? 0}`}
          icon={<AlertTriangle className="h-5 w-5 text-white" />}
          iconBg="bg-gradient-to-br from-red-500 to-rose-600 shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
          cardGradient="from-red-50/50 to-transparent dark:from-red-950/30 dark:to-transparent"
          trend={stats && stats.lowStockCount > 0 ? 'down' : undefined}
          staggerDelay={3}
          numberPopping={numberPopping}
        />
        <StatCard
          title={t('today_orders')}
          value={`${stats?.todayOrders ?? 0}`}
          icon={<ShoppingCart className="h-5 w-5 text-white" />}
          iconBg="bg-gradient-to-br from-teal-500 to-cyan-600 shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
          cardGradient="from-teal-50/50 to-transparent dark:from-teal-950/30 dark:to-transparent"
          trend={stats && stats.todayOrders > 0 ? 'up' : undefined}
          comparison={ordersComparison}
          comparisonLabel={t('vs_yesterday')}
          staggerDelay={4}
          numberPopping={numberPopping}
        />
      </div>

      {/* Sales Trend Chart */}
      <Card className="shadow-md animate-stagger-in bg-gradient-to-b from-background to-muted/10 dark:from-background dark:to-muted/5" style={{ animationDelay: '0.25s' }}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('sales_trend')}</CardTitle>
              <CardDescription>{t('last_7_days')}</CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              {t('last_7_days')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 && chartData.some(d => d.sales > 0 || d.expenses > 0) ? (
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.7} />
                  </linearGradient>
                  <linearGradient id="expensesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.7} />
                  </linearGradient>
                  <filter id="barShadow" x="-10%" y="-5%" width="120%" height="115%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="hsl(var(--chart-1))" floodOpacity={0.2} />
                  </filter>
                </defs>
                <CartesianGrid
                  strokeDasharray="4 4"
                  vertical={false}
                  stroke="hsl(var(--border) / 0.5)"
                />
                {chartData.length > 0 && stats?.todaySales && stats.todaySales > 0 && (
                  <ReferenceLine
                    y={Math.round(chartData.reduce((sum, d) => sum + d.sales, 0) / chartData.length)}
                    stroke="hsl(var(--chart-1) / 0.4)"
                    strokeDasharray="6 3"
                    strokeWidth={1.5}
                    label={{
                      value: 'গড়',
                      position: 'right',
                      fill: 'hsl(var(--muted-foreground))',
                      fontSize: 10,
                    }}
                  />
                )}
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={12}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={12}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => {
                    if (value >= 1000) return formatNumber(value / 1000) + 'k';
                    return formatNumber(value);
                  }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => {
                        const label = name === 'sales' ? t('sales_chart') : t('expenses_chart');
                        return (
                          <div className="flex items-center justify-between gap-4 min-w-[140px]">
                            <span className="text-muted-foreground text-xs">{label}</span>
                            <span className="font-bold text-foreground tabular-nums">
                              {formatPrice(Number(value))}
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <ChartLegend
                  content={<ChartLegendContent />}
                />
                <Bar
                  dataKey="sales"
                  fill="url(#salesGradient)"
                  radius={[8, 8, 2, 2]}
                  maxBarSize={44}
                  filter="url(#barShadow)"
                />
                <Bar
                  dataKey="expenses"
                  fill="url(#expensesGradient)"
                  radius={[8, 8, 2, 2]}
                  maxBarSize={44}
                  filter="url(#barShadow)"
                />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TrendingUp className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">{t('no_sales_trend')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Summary Card */}
      <Card className="shadow-md border-primary/20 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 dark:from-primary/10 dark:via-transparent dark:to-primary/10 animate-stagger-in" style={{ animationDelay: '0.3s' }}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-1.5">
              <Receipt className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-base">{t('today_summary')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <SummaryItem
              icon={<TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />}
              iconBg="bg-green-100 dark:bg-green-900/30"
              label={t('total_sales')}
              value={formatTaka(stats?.todaySales ?? 0)}
            />
            <SummaryItem
              icon={<CircleDollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
              iconBg="bg-emerald-100 dark:bg-emerald-900/30"
              label={t('total_profit')}
              value={formatTaka(profitValue)}
              valueColor={profitValue >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
            />
            <SummaryItem
              icon={<ArrowUpRight className="h-4 w-4 text-orange-600 dark:text-orange-400" />}
              iconBg="bg-orange-100 dark:bg-orange-900/30"
              label={t('total_expenses')}
              value={formatTaka(stats?.todayExpenses ?? 0)}
            />
            <SummaryItem
              icon={<Banknote className="h-4 w-4 text-green-600 dark:text-green-400" />}
              iconBg="bg-green-100 dark:bg-green-900/30"
              label={t('cash_income')}
              value={formatTaka(cashAmount)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="shadow-md animate-stagger-in" style={{ animationDelay: '0.35s' }}>
        <CardHeader>
          <CardTitle>{t('quick_actions')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-4 bg-gradient-to-b from-green-50/50 to-transparent dark:from-green-900/10 dark:to-transparent hover:from-green-100/70 hover:to-green-50/30 dark:hover:from-green-900/20 dark:hover:to-green-900/10 hover:border-green-300 dark:hover:border-green-700 transition-all duration-200 hover:scale-[1.02] hover:shadow-md touch-feedback"
              onClick={() => onNavigate?.('billing')}
            >
              <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-2.5">
                <ShoppingCart className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-sm font-medium">{t('new_sale')}</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-4 bg-gradient-to-b from-blue-50/50 to-transparent dark:from-blue-900/10 dark:to-transparent hover:from-blue-100/70 hover:to-blue-50/30 dark:hover:from-blue-900/20 dark:hover:to-blue-900/10 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200 hover:scale-[1.02] hover:shadow-md touch-feedback"
              onClick={() => onNavigate?.('stock')}
            >
              <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2.5">
                <Plus className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm font-medium">{t('add_stock')}</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-4 bg-gradient-to-b from-purple-50/50 to-transparent dark:from-purple-900/10 dark:to-transparent hover:from-purple-100/70 hover:to-purple-50/30 dark:hover:from-purple-900/20 dark:hover:to-purple-900/10 hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-200 hover:scale-[1.02] hover:shadow-md touch-feedback"
              onClick={() => onNavigate?.('parties')}
            >
              <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-2.5">
                <Users className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-sm font-medium">{t('add_party')}</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-4 bg-gradient-to-b from-orange-50/50 to-transparent dark:from-orange-900/10 dark:to-transparent hover:from-orange-100/70 hover:to-orange-50/30 dark:hover:from-orange-900/20 dark:hover:to-orange-900/10 hover:border-orange-300 dark:hover:border-orange-700 transition-all duration-200 hover:scale-[1.02] hover:shadow-md touch-feedback"
              onClick={() => onNavigate?.('due-collection')}
            >
              <div className="rounded-full bg-orange-100 dark:bg-orange-900/30 p-2.5">
                <IndianRupee className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <span className="text-sm font-medium">{t('due_payments')}</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-4 bg-gradient-to-b from-emerald-50/50 to-transparent dark:from-emerald-900/10 dark:to-transparent hover:from-emerald-100/70 hover:to-emerald-50/30 dark:hover:from-emerald-900/20 dark:hover:to-emerald-900/10 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all duration-200 hover:scale-[1.02] hover:shadow-md touch-feedback"
              onClick={() => setDailySummaryOpen(true)}
            >
              <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 p-2.5">
                <FileText className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-sm font-medium">{t('daily_summary')}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payment Breakdown & Today's Expenses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-stagger-in" style={{ animationDelay: '0.4s' }}>
        {/* Payment Breakdown */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>{t('today_payments_breakdown')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PaymentRow
              label={t('cash')}
              amount={cashAmount}
              total={stats?.todaySales ?? 0}
              color="bg-green-500"
              bgColor="bg-green-100 dark:bg-green-900/20"
              percentage={stats?.todaySales ? Math.round((cashAmount / stats.todaySales) * 100) : 0}
            />
            <PaymentRow
              label={t('upi')}
              amount={upiAmount}
              total={stats?.todaySales ?? 0}
              color="bg-blue-500"
              bgColor="bg-blue-100 dark:bg-blue-900/20"
              percentage={stats?.todaySales ? Math.round((upiAmount / stats.todaySales) * 100) : 0}
            />
            <PaymentRow
              label={t('due')}
              amount={dueAmount}
              total={stats?.todaySales ?? 0}
              color="bg-orange-500"
              bgColor="bg-orange-100 dark:bg-orange-900/20"
              percentage={stats?.todaySales ? Math.round((dueAmount / stats.todaySales) * 100) : 0}
            />
          </CardContent>
        </Card>

        {/* Today's Expenses */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>{t('today_expenses')}</CardTitle>
            <CardDescription>{t('total_store_expenses')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-100 dark:bg-red-950/30 p-3">
                <ArrowUpRight className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold whitespace-nowrap">{formatTaka(stats?.todayExpenses ?? 0)}</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">{t('today_expenses')}</p>
                  {expensesComparison && (
                    <ComparisonBadge comparison={expensesComparison} label={t('vs_yesterday')} />
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t('total_pending_dues')}</span>
                <span className="font-semibold text-orange-600 dark:text-orange-400">
                  {formatTaka(stats?.totalDue ?? 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Items & Recent Transactions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-stagger-in" style={{ animationDelay: '0.45s' }}>
        {/* Low Stock Items */}
        <Card className="shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('low_stock_items')}</CardTitle>
              <Badge variant="destructive" className="text-xs">
                {stats?.lowStockCount ?? 0} {t('items_need_restock')}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {stats?.lowStockProducts && stats.lowStockProducts.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {stats.lowStockProducts.slice(0, 8).map((product) => (
                  <div
                    key={product.id}
                    className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                      product.currentStock === 0
                        ? 'bg-red-50/50 dark:bg-red-900/10 border-l-3 border-l-red-500'
                        : 'bg-amber-50/50 dark:bg-amber-900/10 border-l-3 border-l-amber-400'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${
                        product.currentStock === 0
                          ? 'bg-red-500 animate-pulse'
                          : 'bg-amber-400'
                      }`} />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {product.nameBn || product.name}
                        </p>
                        <p className={`text-xs ${
                          product.currentStock === 0
                            ? 'text-red-600 dark:text-red-400 font-medium'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}>
                          {product.currentStock === 0
                            ? t('out_of_stock')
                            : `${product.currentStock} ${t('left')}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <Badge
                        variant={product.currentStock === 0 ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {t('min')}: {product.minStockLevel}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Package className="h-12 w-12 text-green-400 dark:text-green-500 mb-2" />
                <p className="text-sm text-muted-foreground">{t('all_well_stocked')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('recent_transactions')}</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => onNavigate?.('transactions')}
              >
                {t('view_all')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {stats?.recentTransactions && stats.recentTransactions.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {stats.recentTransactions.slice(0, 5).map((tx) => {
                  const isCompleted = Number(tx.amountPaid || 0) >= Number(tx.totalAmount || 0);
                  const paymentIcon = tx.paymentMethod === 'নগদ'
                    ? <Banknote className="h-3.5 w-3.5" />
                    : tx.paymentMethod === 'ইউপিআই'
                    ? <Smartphone className="h-3.5 w-3.5" />
                    : tx.paymentMethod === 'মিশ্র'
                    ? <CreditCard className="h-3.5 w-3.5" />
                    : <Wallet className="h-3.5 w-3.5" />;
                  return (
                    <div
                      key={tx.id}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                        isCompleted
                          ? 'bg-green-50/50 dark:bg-green-900/10 border-l-3 border-l-green-500'
                          : 'bg-orange-50/50 dark:bg-orange-900/10 border-l-3 border-l-orange-400'
                      }`}
                      onClick={() => {
                        setSelectedTransaction(tx);
                        setIsDetailOpen(true);
                      }}
                    >
                      <div className={`rounded-full p-2 shrink-0 ${
                        isCompleted
                          ? 'bg-green-100 dark:bg-green-900/30'
                          : 'bg-orange-100 dark:bg-orange-900/30'
                      }`}>
                        <Receipt className={`h-4 w-4 ${
                          isCompleted
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-orange-600 dark:text-orange-400'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">
                            {tx.customer?.name || t('walk_in')}
                          </p>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 flex items-center gap-1">
                            {paymentIcon}
                            {tx.paymentMethod}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {tx.invoiceNumber} · {getTimeAgo(tx.createdAt)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-sm">{formatTaka(Number(tx.totalAmount || 0))}</p>
                        {!isCompleted && (
                          <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                            {t('due')}: {formatTaka(Number(tx.totalAmount || 0) - Number(tx.amountPaid || 0))}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="h-12 w-12 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">{t('recent_transactions')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Summary Dialog */}
      <DailySummary open={dailySummaryOpen} onOpenChange={setDailySummaryOpen} />

      {/* Transaction Details Dialog */}
      <TransactionDetailsDialog
        transaction={selectedTransaction}
        isOpen={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onUpdateStatus={fetchStats}
      />
    </div>
  );
}

function ComparisonBadge({
  comparison,
  label,
}: {
  comparison: { pct: number; direction: 'up' | 'down' | 'same' } | null;
  label: string;
}) {
  const { formatNumber } = useNumberFormat();
  if (!comparison) return null;

  if (comparison.direction === 'same') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
        <Minus className="h-2.5 w-2.5" />
        {label}
      </span>
    );
  }

  const isUp = comparison.direction === 'up';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${
      isUp
        ? 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30'
        : 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30'
    }`}>
      {isUp ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
      {formatNumber(comparison.pct)}%
    </span>
  );
}

function StatCard({
  title,
  value,
  icon,
  iconBg,
  cardGradient,
  trend,
  trendLabel,
  profitMargin,
  comparison,
  comparisonLabel,
  staggerDelay,
  numberPopping,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
  cardGradient: string;
  trend?: 'up' | 'down';
  trendLabel?: string;
  profitMargin?: number;
  comparison?: { pct: number; direction: 'up' | 'down' | 'same' } | null;
  comparisonLabel?: string;
  staggerDelay?: number;
  numberPopping?: boolean;
}) {
  const { formatNumber } = useNumberFormat();
  return (
    <Card className={`overflow-hidden shadow-md bg-gradient-to-br ${cardGradient} animate-stagger-in transition-all duration-200 hover:scale-[1.02] hover:shadow-lg cursor-default`} style={{ animationDelay: `${(staggerDelay ?? 0) * 0.05}s` }}>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-center gap-2.5 md:gap-3">
          <div className={`h-8 w-8 md:h-10 md:w-10 rounded-xl ${iconBg} flex items-center justify-center shadow-md shrink-0`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] md:text-xs text-muted-foreground/70 truncate font-medium uppercase tracking-wide">{title}</p>
            <div className="flex items-center gap-1.5 md:gap-2">
              <p className={`text-lg md:text-xl font-bold whitespace-nowrap leading-tight ${numberPopping ? 'animate-number-pop' : ''}`}>{trendLabel}{value}</p>
              {trend && (
                <span className={`inline-flex items-center text-xs font-medium px-1 py-0.5 rounded-full shrink-0 ${
                  trend === 'up'
                    ? 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30'
                    : 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30'
                }`}>
                  {trend === 'up' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                </span>
              )}
            </div>
            {profitMargin !== undefined && profitMargin !== 0 && (
              <p className={`text-[10px] md:text-xs mt-0.5 ${profitMargin > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {profitMargin > 0 ? '+' : ''}{formatNumber(Math.min(Math.max(profitMargin, -999), 999).toFixed(1))}% মার্জিন
              </p>
            )}
            {comparison && comparisonLabel && comparison.direction !== 'same' && (
              <div className="mt-0.5">
                <ComparisonBadge comparison={comparison} label={comparisonLabel} />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryItem({
  icon,
  iconBg,
  label,
  value,
  valueColor,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 p-2.5 md:p-3 rounded-xl bg-background/60 border border-border/40 dark:bg-background/40 dark:border-border/30">
      <div className={`h-8 w-8 md:h-9 md:w-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] md:text-xs text-muted-foreground truncate">{label}</p>
        <p className={`text-sm md:text-base font-bold whitespace-nowrap ${valueColor || ''}`}>{value}</p>
      </div>
    </div>
  );
}

function PaymentRow({
  label,
  amount,
  total,
  color,
  bgColor,
  percentage,
}: {
  label: string;
  amount: number;
  total: number;
  color: string;
  bgColor: string;
  percentage?: number;
}) {
  const { formatPrice, formatNumber } = useNumberFormat();
  const barPercentage = total > 0 ? (amount / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{formatPrice(amount)}</span>
          {percentage !== undefined && percentage > 0 && (
            <span className="text-[10px] font-semibold text-muted-foreground bg-muted/60 dark:bg-muted/40 px-1.5 py-0.5 rounded-full">
              {formatNumber(percentage)}%
            </span>
          )}
        </div>
      </div>
      <div className="h-2.5 rounded-full bg-muted dark:bg-muted/60 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${Math.min(barPercentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-3 p-3 md:p-4 overflow-y-auto h-full">
      {/* Mobile search skeleton */}
      <div className="md:hidden">
        <Skeleton className="h-11 w-full rounded-xl skeleton-shimmer" />
      </div>
      {/* Greeting skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-5 rounded-full" />
        <div>
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2.5 md:gap-3">
                <Skeleton className="h-8 w-8 md:h-10 md:w-10 rounded-xl" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-16 mb-2" />
                  <Skeleton className="h-5 w-24" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Chart skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full rounded-lg" />
        </CardContent>
      </Card>
      {/* Summary skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-36" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[1, 2, 3].map((j) => (
                <Skeleton key={j} className="h-12 w-full rounded-lg" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;
