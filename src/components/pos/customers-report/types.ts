export interface CustomersReportProps {
  onBack: () => void;
}

export interface CustomerStats {
  count: number;
  totalSpent: number;
  totalProfit: number;
  totalInvoices: number;
  maxSpent: { name: string; value: number };
  maxProfit: { name: string; value: number };
  averageSpent: number;
  margin: number;
}
