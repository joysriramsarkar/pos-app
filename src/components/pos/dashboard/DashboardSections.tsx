'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  Banknote,
  Smartphone,
  CreditCard,
  FileText,
} from 'lucide-react';
import {
  ComparisonBadge,
  StatCard,
  SummaryItem,
  PaymentRow,
} from './widgets';
import type { StatsData, ComparisonResult } from './types';
import type { Transaction } from '@/components/pos/transaction-history/types';
import { getGreetingPeriod } from './utils';

interface GreetingHeaderProps {
  greeting: string;
  storeName: string;
  dateLabel: string;
  subtitle: string;
  timeLabel: string;
  endOfDayLabel: string;
  currentTime: Date;
  onOpenDailySummary: () => void;
}

export function GreetingHeader({
  greeting,
  storeName,
  dateLabel,
  subtitle,
  timeLabel,
  endOfDayLabel,
  currentTime,
  onOpenDailySummary,
}: GreetingHeaderProps) {
  const period = getGreetingPeriod(currentTime.getHours());
  const icon =
    period === 'morning' ? <Sun className="h-5 w-5 text-amber-500" /> :
    period === 'afternoon' ? <CloudSun className="h-5 w-5 text-orange-500" /> :
    period === 'evening' ? <Moon className="h-5 w-5 text-indigo-500" /> :
    <Stars className="h-5 w-5 text-purple-500" />;

  return (
    <Card className="bg-gradient-to-r from-primary/5 via-primary/3 to-transparent dark:from-primary/10 dark:via-primary/5 dark:to-transparent border-primary/10 shadow-sm">
      <CardContent className="p-2.5 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0 [&>svg]:h-4 [&>svg]:w-4 sm:[&>svg]:h-5 sm:[&>svg]:w-5">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-xl md:text-2xl font-bold truncate">{greeting}, {storeName}</h2>
            <p className="text-[11px] sm:text-sm text-muted-foreground truncate">{dateLabel} · {subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground bg-background/60 dark:bg-background/30 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5">
          <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
          <span className="tabular-nums">{timeLabel}</span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto sm:ml-2 h-7 sm:h-8 gap-1 text-[11px] sm:text-xs font-semibold border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
            onClick={onOpenDailySummary}
          >
            <FileText className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            {endOfDayLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface StatsGridProps {
  stats: StatsData | null;
  formatTaka: (n: number) => string;
  salesComparison: ComparisonResult;
  ordersComparison: ComparisonResult;
  numberPopping: boolean;
  labels: {
    todaySales: string;
    todayProfit: string;
    totalDue: string;
    lowStock: string;
    todayOrders: string;
    vsYesterday: string;
  };
}

export function StatsGrid({
  stats,
  formatTaka,
  salesComparison,
  ordersComparison,
  numberPopping,
  labels,
}: StatsGridProps) {
  const profitValue = stats?.todayProfit ?? 0;
  const isProfitPositive = profitValue >= 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      <StatCard
        title={labels.todaySales}
        value={formatTaka(stats?.todaySales ?? 0)}
        icon={<TrendingUp className="h-5 w-5 text-white" />}
        iconBg="bg-gradient-to-br from-green-500 to-emerald-600 shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
        cardGradient="from-green-50/50 to-transparent dark:from-green-950/30 dark:to-transparent"
        trend={stats && stats.todaySales > 0 ? 'up' : undefined}
        comparison={salesComparison}
        comparisonLabel={labels.vsYesterday}
        staggerDelay={0}
        numberPopping={numberPopping}
      />
      <StatCard
        title={labels.todayProfit}
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
        title={labels.totalDue}
        value={formatTaka(stats?.totalDue ?? 0)}
        icon={<Wallet className="h-5 w-5 text-white" />}
        iconBg="bg-gradient-to-br from-orange-500 to-amber-600 shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
        cardGradient="from-orange-50/50 to-transparent dark:from-orange-950/30 dark:to-transparent"
        trend={stats && stats.totalDue > 0 ? 'down' : undefined}
        staggerDelay={2}
        numberPopping={numberPopping}
      />
      <StatCard
        title={labels.lowStock}
        value={`${stats?.lowStockCount ?? 0}`}
        icon={<AlertTriangle className="h-5 w-5 text-white" />}
        iconBg="bg-gradient-to-br from-red-500 to-rose-600 shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
        cardGradient="from-red-50/50 to-transparent dark:from-red-950/30 dark:to-transparent"
        trend={stats && stats.lowStockCount > 0 ? 'down' : undefined}
        staggerDelay={3}
        numberPopping={numberPopping}
      />
      <StatCard
        title={labels.todayOrders}
        value={`${stats?.todayOrders ?? 0}`}
        icon={<ShoppingCart className="h-5 w-5 text-white" />}
        iconBg="bg-gradient-to-br from-teal-500 to-cyan-600 shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
        cardGradient="from-teal-50/50 to-transparent dark:from-teal-950/30 dark:to-transparent"
        trend={stats && stats.todayOrders > 0 ? 'up' : undefined}
        comparison={ordersComparison}
        comparisonLabel={labels.vsYesterday}
        staggerDelay={4}
        numberPopping={numberPopping}
      />
    </div>
  );
}

interface TodaySummaryCardProps {
  formatTaka: (n: number) => string;
  todaySales: number;
  profitValue: number;
  todayExpenses: number;
  cashAmount: number;
  labels: {
    todaySummary: string;
    totalSales: string;
    totalProfit: string;
    totalExpenses: string;
    cashIncome: string;
  };
}

export function TodaySummaryCard({
  formatTaka,
  todaySales,
  profitValue,
  todayExpenses,
  cashAmount,
  labels,
}: TodaySummaryCardProps) {
  return (
    <Card className="shadow-sm sm:shadow-md border-primary/20 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 dark:from-primary/10 dark:via-transparent dark:to-primary/10 animate-stagger-in" style={{ animationDelay: '0.3s' }}>
      <CardHeader className="px-3 sm:px-6 py-2.5 sm:py-4 pb-2 sm:pb-3">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="rounded-md sm:rounded-lg bg-primary/10 p-1 sm:p-1.5">
            <Receipt className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
          </div>
          <CardTitle className="text-sm sm:text-base">{labels.todaySummary}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6 pt-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-3 md:gap-4">
          <SummaryItem
            icon={<TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />}
            iconBg="bg-green-100 dark:bg-green-900/30"
            label={labels.totalSales}
            value={formatTaka(todaySales)}
          />
          <SummaryItem
            icon={<CircleDollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
            iconBg="bg-emerald-100 dark:bg-emerald-900/30"
            label={labels.totalProfit}
            value={formatTaka(profitValue)}
            valueColor={profitValue >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
          />
          <SummaryItem
            icon={<ArrowUpRight className="h-4 w-4 text-orange-600 dark:text-orange-400" />}
            iconBg="bg-orange-100 dark:bg-orange-900/30"
            label={labels.totalExpenses}
            value={formatTaka(todayExpenses)}
          />
          <SummaryItem
            icon={<Banknote className="h-4 w-4 text-green-600 dark:text-green-400" />}
            iconBg="bg-green-100 dark:bg-green-900/30"
            label={labels.cashIncome}
            value={formatTaka(cashAmount)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

interface QuickActionsCardProps {
  onNavigate?: (page: string) => void;
  onOpenDailySummary: () => void;
  labels: {
    quickActions: string;
    newSale: string;
    addStock: string;
    addParty: string;
    duePayments: string;
    dailySummary: string;
  };
}

export function QuickActionsCard({ onNavigate, onOpenDailySummary, labels }: QuickActionsCardProps) {
  return (
    <Card className="shadow-sm sm:shadow-md animate-stagger-in" style={{ animationDelay: '0.35s' }}>
      <CardHeader className="px-3 sm:px-6 py-2.5 sm:py-4">
        <CardTitle className="text-sm sm:text-base">{labels.quickActions}</CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6 pt-0">
        <div className="grid grid-cols-3 sm:grid-cols-2 md:grid-cols-5 gap-1.5 sm:gap-3">
          <Button
            variant="outline"
            className="h-auto flex-col gap-1 sm:gap-2 py-2.5 sm:py-4 px-1.5 bg-gradient-to-b from-green-50/50 to-transparent dark:from-green-900/10 dark:to-transparent hover:from-green-100/70 hover:to-green-50/30 dark:hover:from-green-900/20 dark:hover:to-green-900/10 hover:border-green-300 dark:hover:border-green-700 transition-all duration-200 hover:scale-[1.02] hover:shadow-md touch-feedback"
            onClick={() => onNavigate?.('billing')}
          >
            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-1.5 sm:p-2.5">
              <ShoppingCart className="h-4 w-4 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-[10px] sm:text-sm font-medium leading-tight text-center">{labels.newSale}</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto flex-col gap-1 sm:gap-2 py-2.5 sm:py-4 px-1.5 bg-gradient-to-b from-blue-50/50 to-transparent dark:from-blue-900/10 dark:to-transparent hover:from-blue-100/70 hover:to-blue-50/30 dark:hover:from-blue-900/20 dark:hover:to-blue-900/10 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200 hover:scale-[1.02] hover:shadow-md touch-feedback"
            onClick={() => onNavigate?.('stock')}
          >
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-1.5 sm:p-2.5">
              <Plus className="h-4 w-4 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-[10px] sm:text-sm font-medium leading-tight text-center">{labels.addStock}</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto flex-col gap-1 sm:gap-2 py-2.5 sm:py-4 px-1.5 bg-gradient-to-b from-purple-50/50 to-transparent dark:from-purple-900/10 dark:to-transparent hover:from-purple-100/70 hover:to-purple-50/30 dark:hover:from-purple-900/20 dark:hover:to-purple-900/10 hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-200 hover:scale-[1.02] hover:shadow-md touch-feedback"
            onClick={() => onNavigate?.('parties')}
          >
            <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-1.5 sm:p-2.5">
              <Users className="h-4 w-4 sm:h-6 sm:w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="text-[10px] sm:text-sm font-medium leading-tight text-center">{labels.addParty}</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto flex-col gap-1 sm:gap-2 py-2.5 sm:py-4 px-1.5 bg-gradient-to-b from-orange-50/50 to-transparent dark:from-orange-900/10 dark:to-transparent hover:from-orange-100/70 hover:to-orange-50/30 dark:hover:from-orange-900/20 dark:hover:to-orange-900/10 hover:border-orange-300 dark:hover:border-orange-700 transition-all duration-200 hover:scale-[1.02] hover:shadow-md touch-feedback"
            onClick={() => onNavigate?.('due-collection')}
          >
            <div className="rounded-full bg-orange-100 dark:bg-orange-900/30 p-1.5 sm:p-2.5">
              <IndianRupee className="h-4 w-4 sm:h-6 sm:w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <span className="text-[10px] sm:text-sm font-medium leading-tight text-center">{labels.duePayments}</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto flex-col gap-1 sm:gap-2 py-2.5 sm:py-4 px-1.5 col-span-2 sm:col-span-1 bg-gradient-to-b from-emerald-50/50 to-transparent dark:from-emerald-900/10 dark:to-transparent hover:from-emerald-100/70 hover:to-emerald-50/30 dark:hover:from-emerald-900/20 dark:hover:to-emerald-900/10 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all duration-200 hover:scale-[1.02] hover:shadow-md touch-feedback"
            onClick={onOpenDailySummary}
          >
            <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 p-1.5 sm:p-2.5">
              <FileText className="h-4 w-4 sm:h-6 sm:w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-[10px] sm:text-sm font-medium leading-tight text-center">{labels.dailySummary}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface PaymentAndExpensesProps {
  stats: StatsData | null;
  cashAmount: number;
  upiAmount: number;
  dueAmount: number;
  expensesComparison: ComparisonResult;
  formatTaka: (n: number) => string;
  labels: {
    todayPaymentsBreakdown: string;
    cash: string;
    upi: string;
    due: string;
    todayExpenses: string;
    totalStoreExpenses: string;
    totalPendingDues: string;
    vsYesterday: string;
  };
}

export function PaymentAndExpenses({
  stats,
  cashAmount,
  upiAmount,
  dueAmount,
  expensesComparison,
  formatTaka,
  labels,
}: PaymentAndExpensesProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-stagger-in" style={{ animationDelay: '0.4s' }}>
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>{labels.todayPaymentsBreakdown}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PaymentRow
            label={labels.cash}
            amount={cashAmount}
            total={stats?.todaySales ?? 0}
            color="bg-green-500"
            bgColor="bg-green-100 dark:bg-green-900/20"
            percentage={stats?.todaySales ? Math.round((cashAmount / stats.todaySales) * 100) : 0}
          />
          <PaymentRow
            label={labels.upi}
            amount={upiAmount}
            total={stats?.todaySales ?? 0}
            color="bg-blue-500"
            bgColor="bg-blue-100 dark:bg-blue-900/20"
            percentage={stats?.todaySales ? Math.round((upiAmount / stats.todaySales) * 100) : 0}
          />
          <PaymentRow
            label={labels.due}
            amount={dueAmount}
            total={stats?.todaySales ?? 0}
            color="bg-orange-500"
            bgColor="bg-orange-100 dark:bg-orange-900/20"
            percentage={stats?.todaySales ? Math.round((dueAmount / stats.todaySales) * 100) : 0}
          />
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>{labels.todayExpenses}</CardTitle>
          <CardDescription>{labels.totalStoreExpenses}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-red-100 dark:bg-red-950/30 p-3">
              <ArrowUpRight className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold whitespace-nowrap">{formatTaka(stats?.todayExpenses ?? 0)}</p>
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">{labels.todayExpenses}</p>
                {expensesComparison && (
                  <ComparisonBadge comparison={expensesComparison} label={labels.vsYesterday} />
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{labels.totalPendingDues}</span>
              <span className="font-semibold text-orange-600 dark:text-orange-400">
                {formatTaka(stats?.totalDue ?? 0)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface LowStockAndTransactionsProps {
  stats: StatsData | null;
  formatTaka: (n: number) => string;
  getTimeAgo: (dateVal: string | Date) => string;
  onNavigate?: (page: string) => void;
  onSelectTransaction: (tx: Transaction) => void;
  labels: {
    lowStockItems: string;
    itemsNeedRestock: string;
    outOfStock: string;
    left: string;
    min: string;
    allWellStocked: string;
    recentTransactions: string;
    viewAll: string;
    walkIn: string;
    due: string;
  };
}

export function LowStockAndTransactions({
  stats,
  formatTaka,
  getTimeAgo,
  onNavigate,
  onSelectTransaction,
  labels,
}: LowStockAndTransactionsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-stagger-in" style={{ animationDelay: '0.45s' }}>
      <Card className="shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{labels.lowStockItems}</CardTitle>
            <Badge variant="destructive" className="text-xs">
              {stats?.lowStockCount ?? 0} {labels.itemsNeedRestock}
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
                          ? labels.outOfStock
                          : `${product.currentStock} ${labels.left}`}
                        {typeof product.soldLast7 === 'number' && product.soldLast7 > 0
                          ? ` · 7d: ${product.soldLast7}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <Badge
                      variant={product.currentStock === 0 ? 'destructive' : 'secondary'}
                      className="text-xs"
                    >
                      {labels.min}: {product.minStockLevel}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Package className="h-12 w-12 text-green-400 dark:text-green-500 mb-2" />
              <p className="text-sm text-muted-foreground">{labels.allWellStocked}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{labels.recentTransactions}</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => onNavigate?.('transactions')}
            >
              {labels.viewAll}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {stats?.recentTransactions && stats.recentTransactions.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {stats.recentTransactions.slice(0, 5).map((tx) => {
                const isCompleted = Number(tx.amountPaid || 0) >= Number(tx.totalAmount || 0);
                const pm = (tx.paymentMethod || '').toUpperCase();
                const paymentIcon = (pm === 'নগদ' || pm === 'CASH')
                  ? <Banknote className="h-3.5 w-3.5" />
                  : (pm === 'ইউপিআই' || pm === 'UPI')
                  ? <Smartphone className="h-3.5 w-3.5" />
                  : (pm === 'মিশ্র' || pm === 'MIXED')
                  ? <CreditCard className="h-3.5 w-3.5" />
                  : (pm === 'বাকি' || pm === 'DUE')
                  ? <Clock className="h-3.5 w-3.5" />
                  : <Wallet className="h-3.5 w-3.5" />;
                return (
                  <div
                    key={tx.id}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                      isCompleted
                        ? 'bg-green-50/50 dark:bg-green-900/10 border-l-3 border-l-green-500'
                        : 'bg-orange-50/50 dark:bg-orange-900/10 border-l-3 border-l-orange-400'
                    }`}
                    onClick={() => onSelectTransaction(tx)}
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
                          {tx.customer?.name || labels.walkIn}
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
                          {labels.due}: {formatTaka(Number(tx.totalAmount || 0) - Number(tx.amountPaid || 0))}
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
              <p className="text-sm text-muted-foreground">{labels.recentTransactions}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface ReconciliationCardProps {
  reconciliation: NonNullable<StatsData['reconciliation']>;
  formatTaka: (n: number) => string;
  labels: {
    title: string;
    description: string;
    cash: string;
    upi: string;
    due: string;
    expectedDrawer: string;
  };
}

export function ReconciliationCard({ reconciliation, formatTaka, labels }: ReconciliationCardProps) {
  return (
    <Card className="shadow-md border-emerald-200/60 dark:border-emerald-900/40 animate-stagger-in" style={{ animationDelay: '0.35s' }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-3">
            <p className="text-muted-foreground text-xs">{labels.cash}</p>
            <p className="font-semibold tabular-nums">{formatTaka(reconciliation.cashInDrawer)}</p>
          </div>
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3">
            <p className="text-muted-foreground text-xs">{labels.upi}</p>
            <p className="font-semibold tabular-nums">{formatTaka(reconciliation.upiCollected)}</p>
          </div>
          <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-3">
            <p className="text-muted-foreground text-xs">{labels.due}</p>
            <p className="font-semibold tabular-nums">{formatTaka(reconciliation.dueCreated)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-muted-foreground text-xs">{labels.expectedDrawer}</p>
            <p className="font-semibold tabular-nums">{formatTaka(reconciliation.expectedCashAfterExpenses)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
