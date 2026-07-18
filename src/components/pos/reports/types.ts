export interface SaleChartPoint {
  date: string;
  revenue: number;
  profit: number;
  count: number;
}

export interface SummaryData {
  totalRevenue: number;
  totalProfit: number;
  totalSalesCount: number;
  revenueGrowth: number;
  profitMargin: string;
  paymentBreakdown: Record<string, number>;
}

export interface StockItem {
  id: string;
  name: string;
  nameBn?: string;
  category?: string;
  currentStock: number;
  minStockLevel: number;
  unit: string;
  barcode?: string;
}

export interface DueCustomer {
  id: string;
  name: string;
  phone?: string;
  totalDue: number;
  updatedAt: string;
  _count?: { sales: number };
}

export interface TopProduct {
  id: string;
  name: string;
  nameBn?: string;
  unit: string;
  quantity: number;
  revenue: number;
  profit: number;
}

export interface CategoryData {
  name: string;
  revenue: number;
  margin: string;
  percentage: string;
}

export interface TopCustomer {
  id: string;
  name: string;
  phone?: string;
  totalSpent: number;
  orderCount: number;
  aov: number;
  profit?: number;
  margin?: number;
  cost?: number;
}

export interface ProfitRow {
  id?: string | null;
  invoiceNumber?: string;
  name?: string;
  nameBn?: string;
  customerName?: string | null;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  orderCount?: number;
  quantity?: number;
  isWalkIn?: boolean;
}

export interface ProfitSummaryData {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  orderCount: number;
}

export interface ProfitInsightsData {
  topByProfit: { name: string; profit: number } | null;
  lowestMargin: { name: string; margin: number } | null;
  lossMakers: number;
}

export interface ProductDetail {
  summary: {
    totalQty: number;
    totalRevenue: number;
    totalProfit: number;
    profitMargin: string;
    peakHour: string;
    peakDay: string;
    avgOrderQty: number;
  };
  product: {
    id: string;
    name: string;
    nameBn?: string;
    unit: string;
    currentStock: number;
    minStockLevel: number;
  };
  dailyTrend: { date: string; revenue: number; qty: number }[];
  hourlyPattern: { hour: string; qty: number }[];
  weeklyPattern: { day: string; qty: number }[];
  topCustomers: { id: string; name: string; phone?: string; qty: number; revenue: number }[];
}

export interface CustomerDetail {
  totalSpent: number;
  totalProfit?: number;
  profitMargin?: number;
  orderCount: number;
  aov: number;
  monthlyTrend: { month: string; spent: number; profit?: number }[];
  topProducts: { id: string; name: string; qty: number; revenue: number; profit?: number }[];
}

export type ChartType = 'bar' | 'line' | 'area';
export type DatePreset = '1' | '7' | '30' | '365' | 'custom';
export type ProfitGroup = 'orders' | 'items' | 'customers';

export const CHART_CYCLE: ChartType[] = ['bar', 'line', 'area'];

export interface ReportsProps {
  onNavigate?: (page: string) => void;
}
