// ============================================================================
// POS System Type Definitions for Lakhan Bhandar
// ============================================================================

// ============================================================================
// ENUMS
// ============================================================================

export type PaymentMethod = 'Cash' | 'UPI' | 'Mixed' | 'Due' | 'Prepaid';
export type PaymentStatus = 'Paid' | 'Partial' | 'Due';
export type SaleStatus = 'Completed' | 'Cancelled' | 'Refunded';
export type EntryType = 'credit' | 'debit' | 'prepayment-used' | 'prepayment-added' | 'prepayment-restored';
export type StockChangeType = 'purchase' | 'sale' | 'adjustment' | 'return';

// ============================================================================
// CORE ENTITIES
// ============================================================================

export interface Product {
  id: string;
  barcode: string | null;
  name: string;
  nameBn?: string;
  category: string;
  buyingPrice: number;
  sellingPrice: number;
  unit: string;
  currentStock: number;
  minStockLevel: number;
  isActive: boolean;
  imageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  nameBn?: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  totalDue: number;
  totalPaid: number;
  prepaidBalance: number;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerEntry {
  id: string;
  customerId: string;
  entryType: EntryType;
  amount: number;
  balanceAfter: number;
  description?: string;
  referenceId?: string;
  createdAt: Date;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  customerId?: string;
  userId?: string;
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  totalAmount: number | null;
  amountPaid: number | null;
  paymentMethod: PaymentMethod;
  cashAmount?: number;
  upiAmount?: number;
  paymentStatus: PaymentStatus;
  status: SaleStatus;
  notes?: string;
  offlineSynced: boolean;
  createdAt: Date;
  updatedAt: Date;
  customer?: Customer;
  user?: { id: string; name: string; username: string };
  items: SaleItem[];
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  unit?: string;
  createdAt: Date;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  email?: string;
  gstNumber?: string;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Purchase {
  id: string;
  supplierId?: string;
  invoiceNumber?: string;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  supplier?: Supplier;
  items: PurchaseItem[];
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  productName: string;
  quantity: number;
  buyingPrice: number;
  totalPrice: number;
  createdAt: Date;
}

// ============================================================================
// SYNC QUEUE (Offline-First)
// ============================================================================

export interface SyncQueueItem {
  id: string;
  entityType: 'Sale' | 'Customer' | 'Product' | 'Prepayment';
  entityId: string;
  action: 'create' | 'update' | 'delete';
  payload: string;
  synced: boolean;
  syncedAt?: Date;
  failed?: boolean;
  retryCount: number;
  error?: string;
  createdAt: Date;
}

// ============================================================================
// CART & BILLING (Frontend State)
// ============================================================================

export interface CartItem {
  id: string;
  productId: string;
  productName: string;
  barcode?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unit: string;
  availableStock: number;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  customerId?: string;
  customerName?: string;
  paymentMethod: PaymentMethod;
  notes?: string;
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================================
// STORE CONFIGURATION
// ============================================================================

export const STORE_CONFIG = {
  name: 'Lakhan Bhandar',
  nameBn: 'লক্ষ্মণ ভাণ্ডার',
  address: '3 No Gate More, Military Road, Shivmandir, 734011',
  phone: '7584864899',
  gstNumber: '',
  logo: '',
} as const;

// ============================================================================
// PRINT CONFIGURATION
// ============================================================================

export type PrintFormat = 'thermal-58' | 'thermal-80' | 'a4' | 'a5';

export interface PrintConfig {
  format: PrintFormat;
  showLogo: boolean;
  showGst: boolean;
  showPhone: boolean;
  footerMessage?: string;
}
