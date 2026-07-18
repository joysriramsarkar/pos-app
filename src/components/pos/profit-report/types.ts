export type GroupBy = 'orders' | 'items' | 'customers';
export type SortKey = 'profit' | 'revenue' | 'margin';

export interface ProfitSummary {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  orderCount: number;
  itemCount?: number;
}

export interface ProfitInsights {
  topByProfit: { name: string; profit: number } | null;
  lowestMargin: { name: string; margin: number } | null;
  lossMakers: number;
}

export interface ProfitReportProps {
  onBack: () => void;
}

export interface ProfitChartDatum {
  name: string;
  profit: number;
  revenue: number;
}
