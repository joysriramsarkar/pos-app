export interface DueCustomer {
  id: string;
  name: string;
  nameEn: string | null;
  phone: string | null;
  dueAmount: number;
  updatedAt: string;
  lastPaymentDate: string | null;
}

export type ViewState = 'list' | 'form' | 'success';
export type PayMethod = 'Cash' | 'UPI' | 'Mixed';
export type SortMode = 'due_desc' | 'name_asc' | 'oldest';

export const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];
