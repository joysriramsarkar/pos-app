'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { useCartStore, useProductsStore, useSalesStore } from '@/stores/pos-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useToast } from '@/hooks/use-toast';
import { useNumberFormat } from '@/hooks/use-number-format';
import DailySummary from '@/components/pos/DailySummary';
import { TransactionDetailsDialog } from '@/components/pos/transaction-history/TransactionDetailsDialog';
import type { Transaction } from '@/components/pos/transaction-history/types';
import type { Product } from '@/types/pos';
import type { StatsData, DashboardProps } from './types';
import { DashboardSkeleton } from './widgets';
import { SalesTrendChart } from './SalesTrendChart';
import { MobileSearchDialog } from './MobileSearchDialog';
import {
  GreetingHeader,
  StatsGrid,
  TodaySummaryCard,
  QuickActionsCard,
  PaymentAndExpenses,
  LowStockAndTransactions,
  ReconciliationCard,
} from './DashboardSections';
import { getComparison, getGreetingKey } from './utils';
import { normalizeSearchText } from '@/lib/utils';

export function Dashboard({ onNavigate, refreshKey }: DashboardProps) {
  const t = useTranslations('Dashboard');
  const tBilling = useTranslations('Billing');
  const { formatPrice, formatDate, isBn } = useNumberFormat();
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
  const [prevStats, setPrevStats] = useState<StatsData | null>(null);
  const [numberPopping, setNumberPopping] = useState(false);

  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/stats?tzOffset=${new Date().getTimezoneOffset()}&_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
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

  useEffect(() => {
    fetchStats();
  }, [fetchStats, sales]);

  // Refetch whenever dashboard tab becomes active (refreshKey bumps on navigation)
  useEffect(() => {
    if (refreshKey !== undefined) fetchStats();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch on window focus
  useEffect(() => {
    const handleFocus = () => fetchStats();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchStats]);

  const formatTaka = (amount: number) => formatPrice(amount);

  // Search results for mobile quick search
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = normalizeSearchText(searchTerm);
    return products
      .filter((p) => p.isActive && (
        normalizeSearchText(p.name).includes(term) ||
        (p.nameBn && normalizeSearchText(p.nameBn).includes(term)) ||
        (p.barcode && p.barcode.includes(searchTerm.trim()))
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

  const getBengaliDate = () => {
    if (!isBn) {
      const dayName = formatDate(currentTime, { weekday: 'long' });
      const date = formatDate(currentTime, { day: 'numeric' });
      const month = formatDate(currentTime, { month: 'long' });
      const year = formatDate(currentTime, { year: 'numeric' });
      return `${dayName}, ${month} ${date}, ${year}`;
    }
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

  const salesComparison = getComparison(stats?.todaySales ?? 0, stats?.yesterdaySales ?? 0);
  const ordersComparison = getComparison(stats?.todayOrders ?? 0, stats?.yesterdayOrders ?? 0);
  const expensesComparison = getComparison(stats?.todayExpenses ?? 0, stats?.yesterdayExpenses ?? 0);

  const chartData = stats?.last7DaysSales?.map((d, index, arr) => {
    let dayLabel = '';
    if (d.rawDate) {
      dayLabel = formatDate(d.rawDate, { weekday: 'short' });
    } else {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - (arr.length - 1 - index));
      dayLabel = formatDate(targetDate, { weekday: 'short' });
    }
    return {
      date: dayLabel,
      sales: d.sales,
      expenses: d.expenses,
    };
  }) ?? [];

  // Keep sales in deps so unused var warning doesn't fire if eslint tracks store usage
  void sales;

  return (
    <div className="space-y-2 sm:space-y-3 p-2 sm:p-3 md:p-4 animate-page-enter overflow-y-auto h-full">
      {/* Mobile Quick Search - only visible on mobile */}
      <div className="md:hidden">
        <button
          className="w-full flex items-center gap-2 h-9 px-3 rounded-lg border bg-muted/30 text-muted-foreground text-xs touch-feedback"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span>{t('quick_search')}</span>
        </button>
      </div>

      <MobileSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        searchInputRef={searchInputRef}
        searchResults={searchResults}
        onSelect={handleSearchSelect}
        formatTaka={formatTaka}
        labels={{
          quickSearch: t('quick_search'),
          noResults: t('no_results'),
          searchResults: t('search_results'),
          outOfStock: tBilling('out_of_stock'),
          stock: tBilling('stock'),
        }}
      />

      <GreetingHeader
        greeting={t(getGreetingKey(currentTime.getHours()))}
        storeName={settings.store_name_bn || 'লক্ষ্মণ ভাণ্ডার'}
        dateLabel={getBengaliDate()}
        subtitle={t('greeting_card_subtitle')}
        timeLabel={formatDate(currentTime, { hour: '2-digit', minute: '2-digit' })}
        endOfDayLabel={t('end_of_day')}
        currentTime={currentTime}
        onOpenDailySummary={() => setDailySummaryOpen(true)}
      />

      <StatsGrid
        stats={stats}
        formatTaka={formatTaka}
        salesComparison={salesComparison}
        ordersComparison={ordersComparison}
        numberPopping={numberPopping}
        labels={{
          todaySales: t('today_sales'),
          todayProfit: t('today_profit'),
          totalDue: t('total_due'),
          lowStock: t('low_stock'),
          todayOrders: t('today_orders'),
          vsYesterday: t('vs_yesterday'),
        }}
      />

      <SalesTrendChart chartData={chartData} todaySales={stats?.todaySales} />

      <TodaySummaryCard
        formatTaka={formatTaka}
        todaySales={stats?.todaySales ?? 0}
        profitValue={profitValue}
        todayExpenses={stats?.todayExpenses ?? 0}
        cashAmount={cashAmount}
        labels={{
          todaySummary: t('today_summary'),
          totalSales: t('total_sales'),
          totalProfit: t('total_profit'),
          totalExpenses: t('total_expenses'),
          cashIncome: t('cash_income'),
        }}
      />

      <QuickActionsCard
        onNavigate={onNavigate}
        onOpenDailySummary={() => setDailySummaryOpen(true)}
        labels={{
          quickActions: t('quick_actions'),
          newSale: t('new_sale'),
          addStock: t('add_stock'),
          addParty: t('add_party'),
          duePayments: t('due_payments'),
          dailySummary: t('daily_summary'),
        }}
      />

      {stats?.reconciliation && (
        <ReconciliationCard
          reconciliation={stats.reconciliation}
          formatTaka={formatTaka}
          labels={{
            title: t('day_end_reconciliation') || 'Day-end reconciliation',
            description: t('day_end_reconciliation_desc') || 'Cash drawer vs UPI vs dues opened today',
            cash: t('cash'),
            upi: t('upi'),
            due: t('due'),
            expectedDrawer: t('expected_drawer') || 'Expected cash after expenses',
          }}
        />
      )}

      <PaymentAndExpenses
        stats={stats}
        cashAmount={cashAmount}
        upiAmount={upiAmount}
        dueAmount={dueAmount}
        expensesComparison={expensesComparison}
        formatTaka={formatTaka}
        labels={{
          todayPaymentsBreakdown: t('today_payments_breakdown'),
          cash: t('cash'),
          upi: t('upi'),
          due: t('due'),
          todayExpenses: t('today_expenses'),
          totalStoreExpenses: t('total_store_expenses'),
          totalPendingDues: t('total_pending_dues'),
          vsYesterday: t('vs_yesterday'),
        }}
      />

      <LowStockAndTransactions
        stats={stats}
        formatTaka={formatTaka}
        getTimeAgo={getTimeAgo}
        onNavigate={onNavigate}
        onSelectTransaction={(tx) => {
          setSelectedTransaction(tx);
          setIsDetailOpen(true);
        }}
        labels={{
          lowStockItems: t('low_stock_items'),
          itemsNeedRestock: t('items_need_restock'),
          outOfStock: t('out_of_stock'),
          left: t('left'),
          min: t('min'),
          allWellStocked: t('all_well_stocked'),
          recentTransactions: t('recent_transactions'),
          viewAll: t('view_all'),
          walkIn: t('walk_in'),
          due: t('due'),
        }}
      />

      <DailySummary open={dailySummaryOpen} onOpenChange={setDailySummaryOpen} />

      <TransactionDetailsDialog
        transaction={selectedTransaction}
        isOpen={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onUpdateStatus={() => {
          // Dashboard is view-only; status changes are handled in Transaction History
          setIsDetailOpen(false);
        }}
      />
    </div>
  );
}

export default Dashboard;
