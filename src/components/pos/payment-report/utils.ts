import { format } from 'date-fns';
import type { PaymentSummary } from './types';

export function downloadPaymentsCsv(filteredSales: any[], summary: PaymentSummary) {
  if (!filteredSales.length) return;
  const header = ['Invoice No', 'Date', 'Customer', 'Phone', 'Payment Method', 'Total', 'Paid', 'Due Status'];
  const rows = [
    header,
    ...filteredSales.map((s) => [
      s.invoiceNumber,
      format(new Date(s.createdAt), 'dd/MM/yyyy HH:mm'),
      s.customer?.name || 'Walk-in',
      s.customer?.phone || '',
      s.paymentMethod,
      s.totalAmount.toFixed(2),
      s.amountPaid.toFixed(2),
      s.paymentStatus,
    ]),
    ['Total', '', '', '', '', '', summary.total.toFixed(2), ''],
  ];

  const csv = rows.map((r: any[]) => r.map((v: any) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payments-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function computePaymentSummary(sales: any[]): PaymentSummary {
  let cash = 0;
  let upi = 0;
  let prepaid = 0;
  let due = 0;
  let total = 0;

  sales.forEach((s) => {
    if (s.status !== 'Completed' && s.status !== 'PartialReturn') return;

    const amtPaid = Number(s.amountPaid || 0);
    const totalAmt = Number(s.totalAmount || 0);
    const method = s.paymentMethod || 'Cash';
    const hasSplit = s.cashAmount != null || s.upiAmount != null;

    total += amtPaid;

    if (hasSplit || method === 'Mixed') {
      const c = Number(s.cashAmount || 0);
      const u = Number(s.upiAmount || 0);
      if (c > 0 || u > 0) {
        cash += c;
        upi += u;
      } else if (method === 'Mixed') {
        cash += amtPaid;
      }
    } else if (method === 'Cash') {
      cash += amtPaid;
    } else if (method === 'UPI') {
      upi += amtPaid;
    } else if (method === 'Prepaid') {
      prepaid += amtPaid;
    } else if (method === 'Due') {
      cash += amtPaid;
    }

    if (totalAmt > amtPaid) {
      due += totalAmt - amtPaid;
    }
  });

  return { cash, upi, prepaid, due, total };
}
