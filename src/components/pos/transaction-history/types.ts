export interface TransactionItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  unit?: string;
}

export interface Transaction {
  id: string;
  invoiceNumber: string;
  totalAmount: number | null;
  amountPaid: number | null;
  discount: number | null;
  tax: number | null;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  createdAt: Date;
  customer?: {
    id: string;
    name: string;
    nameEn?: string | null;
    phone?: string;
  };
  user?: {
    id: string;
    name: string;
    username: string;
  };
  items: TransactionItem[];
}

export interface PaginationData {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
