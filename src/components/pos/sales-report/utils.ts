import { format } from 'date-fns';
import type { ChartRow } from './types';

export function parseDateSafe(dateStr: string | Date | null | undefined): Date {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  const str = String(dateStr);
  const datePart = str.substring(0, 10);
  return new Date(datePart + 'T12:00:00');
}

export function downloadSalesCsv(
  processedChartData: ChartRow[],
  totalRevenue: number,
  totalProfit: number,
  totalCount: number,
) {
  if (!processedChartData.length) return;
  const header = ['Label / Date', 'Revenue', 'Profit', 'Invoices Count'];
  const rows = [
    header,
    ...processedChartData.map((d) => [
      d.date,
      d.revenue.toFixed(2),
      d.profit.toFixed(2),
      d.count,
    ]),
    ['Total', totalRevenue.toFixed(2), totalProfit.toFixed(2), totalCount],
  ];

  const csv = rows.map((r: any[]) => r.map((v: any) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sales-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
