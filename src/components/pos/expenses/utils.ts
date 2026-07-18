import type { Expense, Supplier } from './types';

export const EXPENSES_CACHE_TTL = 30 * 60 * 1000;

export function parseDateSafe(dateStr: string | Date | null | undefined): Date {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  const str = String(dateStr);
  const datePart = str.substring(0, 10);
  return new Date(datePart + 'T12:00:00');
}

export function loadCachedExpenses(): { expenses: Expense[] | null; suppliers: Supplier[] | null } {
  let expenses: Expense[] | null = null;
  let suppliers: Supplier[] | null = null;

  const cacheTime = localStorage.getItem('expenses-cache-time');
  const cachedExpenses = localStorage.getItem('expenses-cache');
  if (cachedExpenses && cacheTime && Date.now() - parseInt(cacheTime, 10) < EXPENSES_CACHE_TTL) {
    try {
      expenses = JSON.parse(cachedExpenses);
    } catch (err) {
      console.error('Invalid cached expenses', err);
    }
  }

  const suppliersCacheTime = localStorage.getItem('suppliers-cache-time');
  const cachedSuppliers = localStorage.getItem('suppliers-cache');
  if (cachedSuppliers && suppliersCacheTime && Date.now() - parseInt(suppliersCacheTime, 10) < EXPENSES_CACHE_TTL) {
    try {
      suppliers = JSON.parse(cachedSuppliers);
    } catch (err) {
      console.error('Invalid cached suppliers', err);
    }
  }

  return { expenses, suppliers };
}

export function cacheExpenses(data: Expense[]) {
  localStorage.setItem('expenses-cache', JSON.stringify(data));
  localStorage.setItem('expenses-cache-time', Date.now().toString());
}

export function cacheSuppliers(data: Supplier[]) {
  localStorage.setItem('suppliers-cache', JSON.stringify(data));
  localStorage.setItem('suppliers-cache-time', Date.now().toString());
}
