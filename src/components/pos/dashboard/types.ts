import type { ChartConfig } from '@/components/ui/chart';
import type { Transaction } from '@/components/pos/transaction-history/types';

export interface Last7DayData {
  date: string;
  day: string;
  sales: number;
  expenses: number;
}

export interface StatsData {
  todaySales: number;
  todayOrders: number;
  todayCash: number;
  todayUpi: number;
  todayDueCreated?: number;
  todayCollected?: number;
  todayExpenses: number;
  totalDue: number;
  lowStockCount: number;
  lowStockProducts: {
    id: string;
    name: string;
    nameBn: string;
    currentStock: number;
    minStockLevel: number;
    soldLast7?: number;
  }[];
  recentTransactions: Transaction[];
  paymentBreakdown: {
    'নগদ': number;
    'ইউপিআই': number;
    'মিশ্র': number;
    'বাকি': number;
  };
  reconciliation?: {
    salesTotal: number;
    cashInDrawer: number;
    upiCollected: number;
    collected: number;
    dueCreated: number;
    expenses: number;
    expectedCashAfterExpenses: number;
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

export const chartConfig = {
  sales: {
    label: 'বিক্রয়',
    color: 'var(--chart-1)',
  },
  expenses: {
    label: 'খরচ',
    color: 'var(--chart-3)',
  },
} satisfies ChartConfig;

export interface DashboardProps {
  onNavigate?: (page: string) => void;
}

export type ComparisonResult = {
  pct: number;
  direction: 'up' | 'down' | 'same';
} | null;
