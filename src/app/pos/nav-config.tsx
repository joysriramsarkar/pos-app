import type { ReactNode } from 'react';
import {
  ShoppingCart,
  Menu,
  Package,
  LayoutDashboard,
  FileText,
  Users,
  Settings,
  History,
  Banknote,
  IndianRupee,
  ClipboardList,
  Truck,
} from 'lucide-react';

export type PageType =
  | 'dashboard'
  | 'billing'
  | 'stock'
  | 'stock-statistics'
  | 'parties'
  | 'reports'
  | 'transactions'
  | 'expenses'
  | 'expenses-report'
  | 'settings'
  | 'users'
  | 'menu'
  | 'audit'
  | 'due-collection'
  | 'purchase-orders'
  | 'sales-report'
  | 'payment-report'
  | 'stock-report'
  | 'dues-report'
  | 'products-report'
  | 'categories-report'
  | 'customers-report'
  | 'supplier-report';

export type MainNavId = Exclude<
  PageType,
  | 'menu'
  | 'stock-statistics'
  | 'expenses-report'
  | 'sales-report'
  | 'payment-report'
  | 'stock-report'
  | 'dues-report'
  | 'products-report'
  | 'categories-report'
  | 'customers-report'
  | 'supplier-report'
>;

export const navItems: { id: MainNavId; label: string; icon: ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'billing', label: 'Billing', icon: <ShoppingCart className="w-5 h-5" /> },
  { id: 'stock', label: 'Inventory Management', icon: <Package className="w-5 h-5" /> },
  { id: 'parties', label: 'Parties', icon: <Users className="w-5 h-5" /> },
  { id: 'due-collection', label: 'Due Collection', icon: <IndianRupee className="w-5 h-5" /> },
  { id: 'reports', label: 'Reports', icon: <FileText className="w-5 h-5" /> },
  { id: 'transactions', label: 'Transactions', icon: <History className="w-5 h-5" /> },
  { id: 'expenses', label: 'Expenses', icon: <Banknote className="w-5 h-5" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  { id: 'audit', label: 'Audit Logs', icon: <ClipboardList className="w-5 h-5" /> },
  { id: 'purchase-orders', label: 'Purchase Orders', icon: <Truck className="w-5 h-5" /> },
];

export const mobileBottomNavItems: { id: PageType | 'more'; label: string; icon: ReactNode }[] = [
  { id: 'dashboard', label: 'Home', icon: <LayoutDashboard className="w-6 h-6 md:w-5 md:h-5" /> },
  { id: 'billing', label: 'Bill', icon: <ShoppingCart className="w-6 h-6 md:w-5 md:h-5" /> },
  { id: 'stock', label: 'Stock', icon: <Package className="w-6 h-6 md:w-5 md:h-5" /> },
  { id: 'transactions', label: 'Transactions', icon: <History className="w-6 h-6 md:w-5 md:h-5" /> },
  { id: 'more', label: 'More', icon: <Menu className="w-6 h-6 md:w-5 md:h-5" /> },
];

export const MORE_MENU_PAGE_IDS: PageType[] = [
  'reports',
  'settings',
  'parties',
  'users',
  'transactions',
  'expenses',
  'audit',
  'due-collection',
  'purchase-orders',
];
