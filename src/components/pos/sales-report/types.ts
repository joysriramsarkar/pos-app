export type ViewMode = 'daily' | 'weekly' | 'monthly';
export type ChartStyle = 'bar' | 'line' | 'area';

export interface SalesReportProps {
  onBack: () => void;
}

export interface ChartRow {
  date: string;
  revenue: number;
  profit: number;
  count: number;
  prevRevenue?: number;
}
