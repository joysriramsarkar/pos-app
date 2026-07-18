export interface ProductStat {
  id: string;
  name: string;
  nameBn?: string | null;
  unit: string;
  quantity: number;
  revenue: number;
  profit: number;
}

export interface StockHistoryEntry {
  id: string;
  changeType: string;
  quantity: number;
  reason?: string | null;
  referenceId?: string | null;
  createdAt: string;
}

export interface DailySale { date: string; qty: number; revenue: number; }
export interface HourlySale { hour: number; qty: number; }

export interface ProductDetail {
  product: {
    id: string; name: string; nameBn?: string | null; category: string;
    buyingPrice: number; sellingPrice: number; unit: string;
    currentStock: number; minStockLevel: number; barcode?: string | null;
    createdAt: string;
  };
  summary: { totalQtySold: number; totalRevenue: number; totalProfit: number; totalStockAdded: number; };
  stockHistory: StockHistoryEntry[];
  dailySales: DailySale[];
  hourlySales: HourlySale[];
}

export interface ProductStatisticsProps { onBack: () => void; }
