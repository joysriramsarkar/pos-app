import {
  PAYMENT_METHOD_COLORS,
  paymentMethodLabelBn,
  paymentMethodLabelEn,
} from '@/lib/report-filters';

/** Build pie config + colors from actual payment keys (Cash/UPI/Mixed/Due/Prepaid) */
export function buildPaymentChartConfig(keys: string[], isBn: boolean, t?: any) {
  const config: Record<string, { label: string; color: string }> = {};
  for (const key of keys) {
    config[key] = {
      label: isBn ? paymentMethodLabelBn(key) : paymentMethodLabelEn(key),
      color: PAYMENT_METHOD_COLORS[key] || 'var(--chart-5)',
    };
  }
  if (!config.Others) {
    config.Others = {
      label: t ? t('others') : (isBn ? 'অন্যান্য' : 'Others'),
      color: PAYMENT_METHOD_COLORS.Others,
    };
  }
  return config;
}

export function paymentSliceColor(name: string, index: number): string {
  return PAYMENT_METHOD_COLORS[name] || `var(--chart-${(index % 5) + 1})`;
}

export function categorySliceColor(index: number): string {
  return `var(--chart-${(index % 5) + 1})`;
}

export function mergeSmallSlices(data: { name: string; value: number }[], threshold = 0.04) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return data;
  const main = data.filter((d) => d.value / total >= threshold);
  const others = data.filter((d) => d.value / total < threshold);
  if (!others.length) return main;
  return [...main, { name: 'Others', value: others.reduce((s, d) => s + d.value, 0) }];
}

export function downloadCSV(rows: (string | number)[][], filename: string) {
  const csv = rows.map((r) => r.map((v) => {
    const str = String(v);
    const escaped = str.replace(/"/g, '""');
    // Prevent CSV injection by prefixing formulas with a single quote
    const safeStr = /^[=\-+@\t\r]/.test(escaped) ? `\'${escaped}` : escaped;
    return `"${safeStr}"`;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const EXPENSE_CHART_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#8b5cf6',
  '#3b82f6',
  '#10b981',
  '#ec4899',
];

export function parseDateSafe(dateStr: string | Date | null | undefined): Date {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  const str = String(dateStr);
  const datePart = str.substring(0, 10);
  return new Date(datePart + 'T12:00:00');
}
