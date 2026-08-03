import type { ComponentType } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Package, Clock, Truck, CheckCircle, XCircle,
} from 'lucide-react';
import type { PurchaseOrder, PurchaseOrderItem, DateFilter } from './types';

export const WEIGHTED_UNITS = new Set(['kg', 'gram', 'liter', 'ml']);

export const STATUS_CONFIG: Record<string, { color: string; icon: ComponentType<{ className?: string }> }> = {
  'পেন্ডিং': { color: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100', icon: Clock },
  'অর্ডার করা': { color: 'bg-blue-100 text-blue-800 hover:bg-blue-100', icon: Truck },
  'প্রাপ্ত': { color: 'bg-green-100 text-green-800 hover:bg-green-100', icon: CheckCircle },
  'বাতিল': { color: 'bg-red-100 text-red-800 hover:bg-red-100', icon: XCircle },
};

export function getStatusBadge(status: string) {
  const config = STATUS_CONFIG[status] || { color: 'bg-gray-100 text-gray-800', icon: Package };
  const Icon = config.icon;
  return (
    <Badge className={`${config.color} gap-1`}>
      <Icon className="h-3 w-3" />
      {status}
    </Badge>
  );
}

export function getProductName(item: PurchaseOrderItem) {
  return item.product?.nameBn || item.product?.name || item.productId;
}

export function filterOrdersByDate(
  orders: PurchaseOrder[],
  dateFilter: DateFilter,
  customFrom: string,
  customTo: string,
): PurchaseOrder[] {
  let result = orders;
  const now = new Date();

  if (dateFilter === 'today') {
    const todayStr = now.toISOString().split('T')[0];
    result = result.filter((o) => o.createdAt.startsWith(todayStr));
  } else if (dateFilter === 'weekly') {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);
    result = result.filter((o) => new Date(o.createdAt) >= oneWeekAgo);
  } else if (dateFilter === 'monthly') {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(now.getMonth() - 1);
    result = result.filter((o) => new Date(o.createdAt) >= oneMonthAgo);
  } else if (dateFilter === 'custom' && customFrom && customTo) {
    const fromDate = new Date(customFrom);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(customTo);
    toDate.setHours(23, 59, 59, 999);
    result = result.filter((o) => {
      const d = new Date(o.createdAt);
      return d >= fromDate && d <= toDate;
    });
  }
  return result;
}

export function computeFormTotals(
  formItems: { quantity: number | string; unitPrice: number | string; gstPercentage?: number | string }[],
  formGstPercentage: string,
  formDiscountType: 'percent' | 'fixed' = 'percent',
  formDiscountValue: string | number = 0,
) {
  const generalGstRate = parseFloat(formGstPercentage) || 0;
  let formSubtotal = 0;
  let gstAmount = 0;
  formItems.forEach((item) => {
    const qty = parseFloat(item.quantity as string) || 0;
    const unitPrice = parseFloat(item.unitPrice as string) || 0;
    const itemSubtotal = qty * unitPrice;
    formSubtotal += itemSubtotal;

    const hasCustomGst =
      item.gstPercentage !== undefined &&
      item.gstPercentage !== '' &&
      !isNaN(parseFloat(item.gstPercentage as string));
    const itemGstRate = hasCustomGst ? parseFloat(item.gstPercentage as string) : generalGstRate;
    const itemGstAmount = itemSubtotal * (itemGstRate / 100);
    gstAmount += itemGstAmount;
  });

  formSubtotal = Math.round((formSubtotal + Number.EPSILON) * 100) / 100;
  gstAmount = Math.round((gstAmount + Number.EPSILON) * 100) / 100;

  const discountVal = typeof formDiscountValue === 'string' ? parseFloat(formDiscountValue) || 0 : formDiscountValue;
  let discountAmount = formDiscountType === 'percent'
    ? (formSubtotal * discountVal) / 100
    : Math.min(discountVal, formSubtotal);
  discountAmount = Math.round((discountAmount + Number.EPSILON) * 100) / 100;

  const formTotal = Math.max(0, Math.round((formSubtotal - discountAmount + gstAmount + Number.EPSILON) * 100) / 100);
  const totalItemCount = formItems.reduce(
    (sum, i) => sum + (parseFloat(i.quantity as string) || 0),
    0,
  );

  return { formSubtotal, discountAmount, gstAmount, formTotal, totalItemCount };
}
