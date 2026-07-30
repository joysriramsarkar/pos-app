'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const PageLoadingFallback = () => (
  <div className="flex-1 flex items-center justify-center p-8 min-h-[200px] text-muted-foreground">
    <div className="flex flex-col items-center gap-2">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <span className="text-xs">অনুরোধ প্রক্রিয়া করা হচ্ছে...</span>
    </div>
  </div>
);

/** Lazy page shells — keep main entry small and code-split by route area */
export const ProductGrid = dynamic(
  () => import('@/components/pos/ProductGrid').then((m) => ({ default: m.ProductGrid })),
  { ssr: false, loading: PageLoadingFallback },
);
export const CartPanel = dynamic(() => import('@/components/pos/CartPanel'), { ssr: false, loading: PageLoadingFallback });
export const Dashboard = dynamic(
  () => import('@/components/pos/Dashboard').then((m) => ({ default: m.Dashboard })),
  { ssr: false, loading: PageLoadingFallback },
);
export const StockManagement = dynamic(
  () => import('@/components/pos/StockManagement').then((m) => ({ default: m.StockManagement })),
  { ssr: false, loading: PageLoadingFallback },
);
export const PartiesManagement = dynamic(
  () => import('@/components/pos/PartiesManagement').then((m) => ({ default: m.PartiesManagement })),
  { ssr: false, loading: PageLoadingFallback },
);
export const UsersManagement = dynamic(
  () => import('@/components/pos/UsersManagement').then((m) => ({ default: m.UsersManagement })),
  { ssr: false, loading: PageLoadingFallback },
);
export const TransactionHistory = dynamic(
  () => import('@/components/pos/TransactionHistory').then((m) => ({ default: m.TransactionHistory })),
  { ssr: false, loading: PageLoadingFallback },
);
export const Reports = dynamic(() => import('@/components/pos/Reports'), { ssr: false, loading: PageLoadingFallback });
export const AuditLogs = dynamic(
  () => import('@/components/pos/AuditLogs').then((m) => ({ default: m.AuditLogs })),
  { ssr: false, loading: PageLoadingFallback },
);
export const Expenses = dynamic(
  () => import('@/components/pos/Expenses').then((m) => ({ default: m.Expenses })),
  { ssr: false, loading: PageLoadingFallback },
);
export const ExpensesReport = dynamic(
  () => import('@/components/pos/ExpensesReport').then((m) => ({ default: m.ExpensesReport })),
  { ssr: false, loading: PageLoadingFallback },
);
export const ProductStatistics = dynamic(
  () => import('@/components/pos/ProductStatistics').then((m) => ({ default: m.ProductStatistics })),
  { ssr: false, loading: PageLoadingFallback },
);
export const SettingsManagement = dynamic(() => import('@/components/pos/SettingsManagement'), {
  ssr: false,
  loading: PageLoadingFallback,
});
export const NotificationBell = dynamic(() => import('@/components/pos/NotificationBell'), {
  ssr: false,
});
export const KeyboardShortcuts = dynamic(() => import('@/components/pos/KeyboardShortcuts'), {
  ssr: false,
});
export const DueCollection = dynamic(() => import('@/components/pos/DueCollection'), { ssr: false, loading: PageLoadingFallback });
export const PurchaseOrderManagement = dynamic(
  () => import('@/components/pos/PurchaseOrderManagement'),
  { ssr: false, loading: PageLoadingFallback },
);
export const SalesReport = dynamic(
  () => import('@/components/pos/SalesReport').then((m) => ({ default: m.SalesReport })),
  { ssr: false, loading: PageLoadingFallback },
);
export const PaymentReport = dynamic(
  () => import('@/components/pos/PaymentReport').then((m) => ({ default: m.PaymentReport })),
  { ssr: false, loading: PageLoadingFallback },
);
export const StockReport = dynamic(
  () => import('@/components/pos/StockReport').then((m) => ({ default: m.StockReport })),
  { ssr: false, loading: PageLoadingFallback },
);
export const DuesReport = dynamic(
  () => import('@/components/pos/DuesReport').then((m) => ({ default: m.DuesReport })),
  { ssr: false, loading: PageLoadingFallback },
);
export const ProductsReport = dynamic(
  () => import('@/components/pos/ProductsReport').then((m) => ({ default: m.ProductsReport })),
  { ssr: false, loading: PageLoadingFallback },
);
export const CategoriesReport = dynamic(
  () => import('@/components/pos/CategoriesReport').then((m) => ({ default: m.CategoriesReport })),
  { ssr: false, loading: PageLoadingFallback },
);
export const CustomersReport = dynamic(
  () => import('@/components/pos/CustomersReport').then((m) => ({ default: m.CustomersReport })),
  { ssr: false, loading: PageLoadingFallback },
);
export const SupplierReport = dynamic(
  () => import('@/components/pos/SupplierReport').then((m) => ({ default: m.SupplierReport })),
  { ssr: false, loading: PageLoadingFallback },
);
export const ProfitReport = dynamic(
  () => import('@/components/pos/ProfitReport').then((m) => ({ default: m.ProfitReport })),
  { ssr: false, loading: PageLoadingFallback },
);
export const ProductDialog = dynamic(
  () => import('@/components/pos/ProductDialog').then((m) => m.ProductDialog),
  { ssr: false },
);
