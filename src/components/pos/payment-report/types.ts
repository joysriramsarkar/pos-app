export type ViewMode = 'daily' | 'weekly' | 'monthly';

export interface PaymentReportProps {
  onBack: () => void;
}

export interface PaymentSummary {
  cash: number;
  upi: number;
  prepaid: number;
  due: number;
  total: number;
}

export interface TrendDatum {
  label: string;
  cash: number;
  upi: number;
  prepaid: number;
  ts: number;
}

export const COLORS = [
  'var(--chart-2)', 'var(--chart-1)', 'var(--chart-3)',
  'var(--chart-4)', 'var(--chart-5)', 'var(--chart-2)',
  'var(--chart-3)', 'var(--chart-1)',
];
