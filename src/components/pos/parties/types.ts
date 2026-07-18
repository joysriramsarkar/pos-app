import type { Customer, Supplier, LedgerEntry } from '@/types/pos';
import type { PartyType } from './parties-utils';

export type { PartyType, Customer, Supplier, LedgerEntry };

export interface PartyFormState {
  name: string;
  nameEn: string;
  phone: string;
  address: string;
  notes: string;
}

export const EMPTY_PARTY_FORM: PartyFormState = {
  name: '',
  nameEn: '',
  phone: '',
  address: '',
  notes: '',
};

/** Shape returned by `/api/reports/customers?customerId=...` */
export interface CustomerPurchaseDetail {
  totalSpent?: number;
  orderCount?: number;
  aov?: number;
  topProducts?: Array<{
    id: string;
    name: string;
    qty: number;
    revenue: number;
  }>;
  categoryBreakdown?: Array<{
    name: string;
    value: number;
  }>;
  monthlyTrend?: Array<{
    month: string;
    spent: number;
  }>;
  hourly?: unknown;
}

export type SupplierWithBalances = Supplier & {
  totalPurchases?: number;
  totalPaid?: number;
  totalDue?: number;
};
