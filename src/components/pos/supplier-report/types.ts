export type ViewMode = 'daily' | 'weekly' | 'monthly';
export type ChartStyle = 'bar' | 'line' | 'area';

export interface SupplierReportProps {
  onBack: () => void;
}

export interface SupplierSummary {
  totalOrdersCount: number;
  pendingOrdersCount: number;
  orderedOrdersCount: number;
  receivedOrdersCount: number;
  cancelledOrdersCount: number;
  receivedPurchasesAmount: number;
  totalPurchasesAmount: number;
  totalPaymentsAmount: number;
}

export const EMPTY_SUMMARY: SupplierSummary = {
  totalOrdersCount: 0,
  pendingOrdersCount: 0,
  orderedOrdersCount: 0,
  receivedOrdersCount: 0,
  cancelledOrdersCount: 0,
  receivedPurchasesAmount: 0,
  totalPurchasesAmount: 0,
  totalPaymentsAmount: 0,
};
