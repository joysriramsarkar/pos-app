export interface DailySummaryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface PaymentBreakdownItem {
  amount: number;
  count: number;
}

export interface TopProduct {
  name: string;
  nameBn: string;
  quantity: number;
  revenue: number;
}

export interface LowStockProduct {
  id: string;
  name: string;
  nameBn: string;
  currentStock: number;
  minStockLevel: number;
}

export interface DailySummaryData {
  date: string;
  totalSalesAmount: number;
  totalSalesCount: number;
  avgOrderValue: number;
  paymentBreakdown: {
    নগদ: PaymentBreakdownItem;
    ইউপিআই: PaymentBreakdownItem;
    মিশ্র: PaymentBreakdownItem;
    বাকি: PaymentBreakdownItem;
  };
  totalExpenses: number;
  expenseByCategory: Record<string, number>;
  costOfGoodsSold: number;
  grossProfit: number;
  netProfit: number;
  duesCollected: number;
  newDuesCreated: number;
  topProducts: TopProduct[];
  lowStockCount: number;
  outOfStockCount: number;
  lowStockProducts: LowStockProduct[];
  totalCustomerDues: number;
  customersWithDueCount: number;
  openingBalance: number;
  closingBalance: number;
  todayCashTotal: number;
  todayUpiTotal: number;
  totalPurchasesAmount: number;
}
