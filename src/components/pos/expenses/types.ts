import {
  Wallet,
  Truck,
  Building2,
  Wrench,
  Briefcase,
  MoreHorizontal,
} from 'lucide-react';

export const CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Maintenance', 'Supplier Payment', 'Other'] as const;

export const CATEGORY_CONFIG: Record<string, { icon: typeof Wallet; color: string; bgColor: string; gradient: string }> = {
  Rent: { icon: Building2, color: 'text-purple-600', bgColor: 'bg-purple-100', gradient: 'from-purple-500/10 to-purple-500/5' },
  Utilities: { icon: Wrench, color: 'text-blue-600', bgColor: 'bg-blue-100', gradient: 'from-blue-500/10 to-blue-500/5' },
  Salaries: { icon: Briefcase, color: 'text-green-600', bgColor: 'bg-green-100', gradient: 'from-green-500/10 to-green-500/5' },
  Maintenance: { icon: Wrench, color: 'text-orange-600', bgColor: 'bg-orange-100', gradient: 'from-orange-500/10 to-orange-500/5' },
  'Supplier Payment': { icon: Truck, color: 'text-rose-600', bgColor: 'bg-rose-100', gradient: 'from-rose-500/10 to-rose-500/5' },
  Other: { icon: MoreHorizontal, color: 'text-gray-600', bgColor: 'bg-gray-100', gradient: 'from-gray-500/10 to-gray-500/5' },
};

export type Supplier = { id: string; name: string; nameEn?: string | null };

export interface Expense {
  id: string;
  amount: number;
  category: string;
  notes?: string | null;
  paymentMethod?: string | null;
  date: string | Date;
  supplierId?: string | null;
  supplierName?: string | null;
  supplierNameEn?: string | null;
  isActive?: boolean;
  createdAt?: string | Date;
}

export interface ExpensesProps {
  onReport?: () => void;
}

export interface CategoryBreakdownItem {
  category: string;
  amount: number;
  percentage: number;
  count: number;
}
