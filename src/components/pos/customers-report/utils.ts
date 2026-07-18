import { format } from 'date-fns';
import type { CustomerStats } from './types';

export function computeCustomerStats(customers: any[]): CustomerStats {
  let count = customers.length;
  let totalSpent = 0;
  let totalProfit = 0;
  let totalInvoices = 0;
  let maxSpent = { name: '—', value: 0 };
  let maxProfit = { name: '—', value: 0 };

  customers.forEach((c) => {
    const spent = Number(c.totalSpent || 0);
    const profit = Number(c.profit || 0);
    totalSpent += spent;
    totalProfit += profit;
    totalInvoices += Number(c.orderCount || 0);

    if (spent > maxSpent.value) {
      maxSpent = { name: c.name, value: spent };
    }
    if (profit > maxProfit.value) {
      maxProfit = { name: c.name, value: profit };
    }
  });

  const averageSpent = count > 0 ? totalSpent / count : 0;
  const margin = totalSpent > 0 ? (totalProfit / totalSpent) * 100 : 0;

  return {
    count,
    totalSpent,
    totalProfit,
    totalInvoices,
    maxSpent,
    maxProfit,
    averageSpent,
    margin,
  };
}

export function downloadCustomersCsv(filteredCustomers: any[]) {
  if (!filteredCustomers.length) return;
  const header = ['Rank', 'Customer Name', 'Phone', 'Orders Count', 'Total Spent', 'Profit', 'Margin %', 'Average Order Value (AOV)', 'Outstanding Dues'];
  const rows = [
    header,
    ...filteredCustomers.map((c, index) => [
      index + 1,
      c.name,
      c.phone || 'N/A',
      c.orderCount,
      Number(c.totalSpent || 0).toFixed(2),
      Number(c.profit || 0).toFixed(2),
      Number(c.margin || 0).toFixed(1),
      Number(c.aov || 0).toFixed(2),
      Number(c.totalDue || 0).toFixed(2),
    ]),
  ];

  const csv = rows.map((r: any[]) => r.map((v: any) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `top-customers-performance-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
