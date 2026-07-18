import { format } from 'date-fns';
import type { GroupBy } from './types';

export const profitColor = (n: number) =>
  n > 0 ? 'text-emerald-600' : n < 0 ? 'text-red-500' : 'text-muted-foreground';

export function downloadProfitCsv(groupBy: GroupBy, filteredRows: any[]) {
  if (!filteredRows.length) return;
  let header: string[];
  let body: (string | number)[][];

  if (groupBy === 'orders') {
    header = ['Invoice', 'Date', 'Customer', 'Payment', 'Revenue', 'Cost', 'Profit', 'Margin %'];
    body = filteredRows.map((r) => [
      r.invoiceNumber,
      r.date ? format(new Date(r.date), 'yyyy-MM-dd HH:mm') : '',
      r.customerName || 'Walk-in',
      r.paymentMethod,
      Number(r.revenue).toFixed(2),
      Number(r.cost).toFixed(2),
      Number(r.profit).toFixed(2),
      Number(r.margin).toFixed(1),
    ]);
  } else if (groupBy === 'items') {
    header = ['Product', 'Unit', 'Qty', 'Orders', 'Revenue', 'Cost', 'Profit', 'Margin %'];
    body = filteredRows.map((r) => [
      r.name,
      r.unit,
      r.quantity,
      r.orderCount,
      Number(r.revenue).toFixed(2),
      Number(r.cost).toFixed(2),
      Number(r.profit).toFixed(2),
      Number(r.margin).toFixed(1),
    ]);
  } else {
    header = ['Customer', 'Phone', 'Orders', 'Revenue', 'Cost', 'Profit', 'Margin %', 'AOV'];
    body = filteredRows.map((r) => [
      r.name,
      r.phone || '',
      r.orderCount,
      Number(r.revenue).toFixed(2),
      Number(r.cost).toFixed(2),
      Number(r.profit).toFixed(2),
      Number(r.margin).toFixed(1),
      Number(r.aov).toFixed(2),
    ]);
  }

  const csv = [header, ...body].map((row) => row.map((v) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `profit-${groupBy}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
