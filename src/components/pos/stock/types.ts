import type { Product } from '@/types/pos';

export interface StockManagementProps {
  onAddProduct?: () => void;
  onEditProduct?: (product: Product) => void;
  onAddStock?: (product: Product) => void;
  onDeleteProduct?: (product: Product) => void;
  onStatistics?: () => void;
}

export type SortField = 'name' | 'stock' | 'price' | 'category';
export type SortOrder = 'asc' | 'desc';
export type StockFilter = 'all' | 'low' | 'out' | 'inactive' | 'no_barcode';
