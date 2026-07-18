export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  receivedQty: number;
  product?: { id: string; name: string; nameBn: string; unit: string };
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string | null;
  status: string;
  totalAmount: number;
  paidAmount: number;
  notes: string | null;
  expectedDate: string | null;
  createdAt: string;
  updatedAt: string;
  supplier?: { id: string; name: string; phone: string | null } | null;
  items: PurchaseOrderItem[];
}

export interface FormItem {
  productId: string;
  quantity: number | string;
  unitPrice: number | string;
  gstPercentage?: number | string;
}

export interface ReceiveItem {
  id: string;
  receivedQty: number | string;
  maxQty: number;
  productName: string;
  unit: string;
}

export type DateFilter = 'all' | 'today' | 'weekly' | 'monthly' | 'custom';
export type ViewMode = 'list' | 'statistics';
