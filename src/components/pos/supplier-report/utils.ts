import { format } from 'date-fns';

export function parseDateSafe(dateStr: string | Date | null | undefined): Date {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  const str = String(dateStr);
  const datePart = str.substring(0, 10);
  return new Date(datePart + 'T12:00:00');
}

export function downloadSuppliersCsv(topSuppliers: any[]) {
  if (!topSuppliers.length) return;

  const header = ['Rank', 'Supplier Name', 'Orders Placed', 'Total Purchases Amount'];
  const rows = [
    header,
    ...topSuppliers.map((s: any, idx: number) => [
      idx + 1,
      s.name,
      s.orderCount,
      s.totalAmount.toFixed(2),
    ]),
  ];

  const csv = rows.map((r: any[]) => r.map((v: any) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `suppliers-purchase-performance-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
