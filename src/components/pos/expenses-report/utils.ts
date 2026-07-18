import { EXPENSES_REPORT_CACHE_TTL } from './types';

export function parseDateSafe(dateStr: string | Date | null | undefined): Date {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  const str = String(dateStr);
  const datePart = str.substring(0, 10);
  return new Date(datePart + 'T12:00:00');
}

export function getExpensesReportCache(key: string) {
  const cached = localStorage.getItem(`expenses-report-cache-${key}`);
  if (!cached) return null;
  try {
    const parsed = JSON.parse(cached);
    if (!parsed?.timestamp || parsed?.data === undefined) return null;
    if (Date.now() - parsed.timestamp > EXPENSES_REPORT_CACHE_TTL) return null;
    return parsed.data;
  } catch (err) {
    console.error('Invalid expenses report cache:', err);
    return null;
  }
}

export function setExpensesReportCache(key: string, data: any[]) {
  localStorage.setItem(`expenses-report-cache-${key}`, JSON.stringify({ data, timestamp: Date.now() }));
}
