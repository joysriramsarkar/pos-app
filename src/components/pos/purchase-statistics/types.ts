export interface SummaryData {
  totalOrdersCount: number;
  pendingOrdersCount: number;
  orderedOrdersCount: number;
  receivedOrdersCount: number;
  cancelledOrdersCount: number;
  receivedPurchasesAmount: number;
  totalPurchasesAmount: number;
  totalPaymentsAmount: number;
}

export interface ChartPoint {
  date: string;
  amount: number;
  count: number;
}

export interface TopSupplier {
  id: string;
  name: string;
  orderCount: number;
  totalAmount: number;
}

export interface TopProduct {
  id: string;
  name: string;
  nameBn: string | null;
  quantity: number;
  totalSpent: number;
  avgPrice: number;
}

export interface ReportResponse {
  success: boolean;
  summary: SummaryData;
  chartData: ChartPoint[];
  topSuppliers: TopSupplier[];
  topProducts: TopProduct[];
}

export interface PurchaseStatisticsProps {
  onBack: () => void;
}
