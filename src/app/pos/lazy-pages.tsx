'use client';

import dynamic from 'next/dynamic';

/** Lazy page shells — keep main entry small and code-split by route area */
export const ProductGrid = dynamic(
  () => import('@/components/pos/ProductGrid').then((m) => ({ default: m.ProductGrid })),
  { ssr: false },
);
export const CartPanel = dynamic(() => import('@/components/pos/CartPanel'), { ssr: false });
export const Dashboard = dynamic(
  () => import('@/components/pos/Dashboard').then((m) => ({ default: m.Dashboard })),
  { ssr: false },
);
export const StockManagement = dynamic(
  () => import('@/components/pos/StockManagement').then((m) => ({ default: m.StockManagement })),
  { ssr: false },
);
export const PartiesManagement = dynamic(
  () => import('@/components/pos/PartiesManagement').then((m) => ({ default: m.PartiesManagement })),
  { ssr: false },
);
export const UsersManagement = dynamic(
  () => import('@/components/pos/UsersManagement').then((m) => ({ default: m.UsersManagement })),
  { ssr: false },
);
export const TransactionHistory = dynamic(
  () => import('@/components/pos/TransactionHistory').then((m) => ({ default: m.TransactionHistory })),
  { ssr: false },
);
export const Reports = dynamic(() => import('@/components/pos/Reports'), { ssr: false });
export const AuditLogs = dynamic(
  () => import('@/components/pos/AuditLogs').then((m) => ({ default: m.AuditLogs })),
  { ssr: false },
);
export const Expenses = dynamic(
  () => import('@/components/pos/Expenses').then((m) => ({ default: m.Expenses })),
  { ssr: false },
);
export const ExpensesReport = dynamic(
  () => import('@/components/pos/ExpensesReport').then((m) => ({ default: m.ExpensesReport })),
  { ssr: false },
);
export const ProductStatistics = dynamic(
  () => import('@/components/pos/ProductStatistics').then((m) => ({ default: m.ProductStatistics })),
  { ssr: false },
);
export const SettingsManagement = dynamic(() => import('@/components/pos/SettingsManagement'), {
  ssr: false,
});
export const NotificationBell = dynamic(() => import('@/components/pos/NotificationBell'), {
  ssr: false,
});
export const KeyboardShortcuts = dynamic(() => import('@/components/pos/KeyboardShortcuts'), {
  ssr: false,
});
export const DueCollection = dynamic(() => import('@/components/pos/DueCollection'), { ssr: false });
export const PurchaseOrderManagement = dynamic(
  () => import('@/components/pos/PurchaseOrderManagement'),
  { ssr: false },
);
export const SalesReport = dynamic(
  () => import('@/components/pos/SalesReport').then((m) => ({ default: m.SalesReport })),
  { ssr: false },
);
export const PaymentReport = dynamic(
  () => import('@/components/pos/PaymentReport').then((m) => ({ default: m.PaymentReport })),
  { ssr: false },
);
export const StockReport = dynamic(
  () => import('@/components/pos/StockReport').then((m) => ({ default: m.StockReport })),
  { ssr: false },
);
export const DuesReport = dynamic(
  () => import('@/components/pos/DuesReport').then((m) => ({ default: m.DuesReport })),
  { ssr: false },
);
export const ProductsReport = dynamic(
  () => import('@/components/pos/ProductsReport').then((m) => ({ default: m.ProductsReport })),
  { ssr: false },
);
export const CategoriesReport = dynamic(
  () => import('@/components/pos/CategoriesReport').then((m) => ({ default: m.CategoriesReport })),
  { ssr: false },
);
export const CustomersReport = dynamic(
  () => import('@/components/pos/CustomersReport').then((m) => ({ default: m.CustomersReport })),
  { ssr: false },
);
export const SupplierReport = dynamic(
  () => import('@/components/pos/SupplierReport').then((m) => ({ default: m.SupplierReport })),
  { ssr: false },
);
export const ProfitReport = dynamic(
  () => import('@/components/pos/ProfitReport').then((m) => ({ default: m.ProfitReport })),
  { ssr: false },
);
export const ProductDialog = dynamic(
  () => import('@/components/pos/ProductDialog').then((m) => m.ProductDialog),
  { ssr: false },
);
