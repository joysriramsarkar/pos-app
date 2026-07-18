export const CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Maintenance', 'Supplier Payment', 'Other'] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  Rent: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Utilities: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Salaries: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Maintenance: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  'Supplier Payment': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  Other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

export const CHART_COLORS = [
  'var(--chart-5)', 'var(--chart-3)', 'var(--chart-2)',
  'var(--chart-1)', 'var(--chart-4)', 'var(--chart-5)',
  'var(--chart-3)', 'var(--chart-1)',
];

export type ViewMode = 'daily' | 'weekly' | 'monthly';

export interface ExpensesReportProps {
  onBack: () => void;
}

export const EXPENSES_REPORT_CACHE_TTL = 30 * 60 * 1000;
