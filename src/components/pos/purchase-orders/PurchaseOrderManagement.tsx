'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useProductsStore } from '@/stores/pos-store';
import { useNumberFormat } from '@/hooks/use-number-format';
import { Supplier } from '@/types/pos';
import { convertBengaliToEnglishNumerals } from '@/lib/utils';
import { toast } from 'sonner';
import PurchaseStatistics from '../PurchaseStatistics';
import type { PurchaseOrder, FormItem, ReceiveItem, DateFilter, ViewMode } from './types';
import { filterOrdersByDate, computeFormTotals } from './utils';
import { PurchaseOrderList } from './PurchaseOrderList';
import { PurchaseOrderFormDialog } from './PurchaseOrderFormDialog';
import { PurchaseOrderDetailDialog } from './PurchaseOrderDetailDialog';
import { ReceiveStockDialog } from './ReceiveStockDialog';

export default function PurchaseOrderManagement() {
  const t = useTranslations('PurchaseOrders');
  const tc = useTranslations('Common');
  const { formatPrice, formatDate, currencySymbol } = useNumberFormat();

  const products = useProductsStore((state) => state.products);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('সব');
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);

  // Create form state
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formSupplierName, setFormSupplierName] = useState('');
  const [formItems, setFormItems] = useState<FormItem[]>([]);
  const [formExpectedDate, setFormExpectedDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formAmountPaid, setFormAmountPaid] = useState('');
  const [formProductId, setFormProductId] = useState('');
  const [formProductName, setFormProductName] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productOpen, setProductOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [formPaymentMethod, setFormPaymentMethod] = useState('Cash');
  const [formGstPercentage, setFormGstPercentage] = useState('');
  const [formCashAmount, setFormCashAmount] = useState('');
  const [formUpiAmount, setFormUpiAmount] = useState('');

  // Receive form state
  const [receiveItems, setReceiveItems] = useState<ReceiveItem[]>([]);
  const [receiveAmountPaid, setReceiveAmountPaid] = useState<string>('');
  const [receivePaymentMethod, setReceivePaymentMethod] = useState('Cash');
  const [receiveCashAmount, setReceiveCashAmount] = useState('');
  const [receiveUpiAmount, setReceiveUpiAmount] = useState('');
  const [lastAddedProductId, setLastAddedProductId] = useState<string | null>(null);

  useEffect(() => {
    if (formPaymentMethod === 'Mixed') {
      const cash = parseFloat(formCashAmount) || 0;
      const upi = parseFloat(formUpiAmount) || 0;
      setFormAmountPaid(String(cash + upi));
    }
  }, [formCashAmount, formUpiAmount, formPaymentMethod]);

  useEffect(() => {
    if (receivePaymentMethod === 'Mixed') {
      const cash = parseFloat(receiveCashAmount) || 0;
      const upi = parseFloat(receiveUpiAmount) || 0;
      setReceiveAmountPaid(String(cash + upi));
    }
  }, [receiveCashAmount, receiveUpiAmount, receivePaymentMethod]);

  useEffect(() => {
    if (lastAddedProductId) {
      const timer = setTimeout(() => {
        const input = document.getElementById(`qty-${lastAddedProductId}`);
        if (input) {
          input.focus();
          (input as HTMLInputElement).select();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [lastAddedProductId]);

  const receiveTotal = useMemo(() => {
    if (!selectedOrder) return 0;
    return receiveItems.reduce((sum, item) => {
      const orderItem = selectedOrder.items.find((i) => i.id === item.id);
      return sum + (parseFloat(item.receivedQty as string) || 0) * (orderItem?.unitPrice || 0);
    }, 0);
  }, [receiveItems, selectedOrder]);

  const fetchSuppliers = useCallback(async (query = '') => {
    const applyCachedFilter = (cached: Supplier[]) => {
      const q = query.trim().toLowerCase();
      if (!q) return cached;
      return cached.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.phone && s.phone.includes(query.trim()))
      );
    };

    try {
      const params = new URLSearchParams();
      params.set('pageSize', '100');
      if (query.trim()) params.set('search', query.trim());
      const res = await fetch(`/api/suppliers?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setSuppliers(result.data || []);
          return;
        }
      }
      const { SuppliersDB } = await import('@/lib/offline/indexeddb');
      const cached = await SuppliersDB.getAll();
      setSuppliers(applyCachedFilter(cached || []));
    } catch (error) {
      console.error('Failed to fetch suppliers:', error);
      try {
        const { SuppliersDB } = await import('@/lib/offline/indexeddb');
        const cached = await SuppliersDB.getAll();
        setSuppliers(applyCachedFilter(cached || []));
      } catch (dbErr) {
        console.error('Failed to load suppliers from cache:', dbErr);
      }
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'সব') params.set('status', statusFilter);
      const res = await fetch(`/api/purchase-orders?${params.toString()}`);
      const data = await res.json();
      if (data.success) setOrders(data.data);
    } catch {
      toast.error(tc('error'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, tc]);

  useEffect(() => {
    fetchSuppliers();
    fetchOrders();
  }, [fetchSuppliers, fetchOrders]);

  useEffect(() => {
    if (!showCreateDialog) return;
    const timer = window.setTimeout(() => fetchSuppliers(supplierSearch), 200);
    return () => window.clearTimeout(timer);
  }, [fetchSuppliers, supplierSearch, showCreateDialog]);

  const availableProducts = useMemo(
    () => products.filter((p) => p.isActive && !formItems.some((fi) => fi.productId === p.id)),
    [products, formItems]
  );

  const supplierProductIds = useMemo(() => {
    if (!formSupplierId || formSupplierId === 'none') return new Set<string>();
    const productIds = new Set<string>();
    orders.forEach((order) => {
      if (order.supplierId === formSupplierId) {
        order.items.forEach((item) => {
          productIds.add(item.productId);
        });
      }
    });
    return productIds;
  }, [orders, formSupplierId]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim();
    let result = availableProducts;
    if (q) {
      const lowerQuery = q.toLowerCase();
      const normalizedQuery = convertBengaliToEnglishNumerals(q);
      result = availableProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(lowerQuery) ||
          p.nameBn?.includes(q) ||
          p.barcode?.includes(q) ||
          convertBengaliToEnglishNumerals(p.barcode || '').includes(normalizedQuery) ||
          p.category.toLowerCase().includes(lowerQuery)
      );
    }
    // Sort supplier's products first
    if (formSupplierId && formSupplierId !== 'none') {
      result = [...result].sort((a, b) => {
        const aIsSupplierProduct = supplierProductIds.has(a.id) ? 1 : 0;
        const bIsSupplierProduct = supplierProductIds.has(b.id) ? 1 : 0;
        return bIsSupplierProduct - aIsSupplierProduct;
      });
    }
    return result;
  }, [availableProducts, productSearch, formSupplierId, supplierProductIds]);

  const filteredOrders = useMemo(
    () => filterOrdersByDate(orders, dateFilter, customFrom, customTo),
    [orders, dateFilter, customFrom, customTo],
  );

  const totalOrders = filteredOrders.length;
  const pendingCount = filteredOrders.filter((o) => o.status === 'পেন্ডিং').length;
  const receivedCount = filteredOrders.filter((o) => o.status === 'প্রাপ্ত').length;
  const totalValue = filteredOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  const addFormItem = () => {
    if (!formProductId) {
      toast.error(t('select_product'));
      return;
    }
    const product = products.find((p) => p.id === formProductId);
    if (!product) return;
    if (formItems.some((i) => i.productId === formProductId)) {
      toast.error('পণ্য ইতোমধ্যে যোগ করা হয়েছে');
      return;
    }
    setFormItems([...formItems, { productId: formProductId, quantity: 1, unitPrice: Number(product.buyingPrice), gstPercentage: '' }]);
    setLastAddedProductId(formProductId);
    setFormProductId('');
    setFormProductName('');
    setProductSearch('');
    setProductOpen(false);
  };

  const removeFormItem = (productId: string) => {
    setFormItems(formItems.filter((i) => i.productId !== productId));
  };

  const updateFormItem = (productId: string, field: 'quantity' | 'unitPrice' | 'gstPercentage', value: number | string) => {
    setFormItems(formItems.map((i) => (i.productId === productId ? { ...i, [field]: value } : i)));
  };

  const { formSubtotal, gstAmount, formTotal, totalItemCount } = computeFormTotals(formItems, formGstPercentage);

  const formPaidVal = parseFloat(formAmountPaid) || 0;
  const formDueAmount = Math.round((formTotal - formPaidVal + Number.EPSILON) * 100) / 100;

  const resetForm = () => {
    setFormSupplierId('');
    setFormSupplierName('');
    setFormItems([]);
    setFormExpectedDate('');
    setFormNotes('');
    setFormAmountPaid('');
    setFormProductId('');
    setFormProductName('');
    setProductSearch('');
    setProductOpen(false);
    setSupplierSearch('');
    setSupplierOpen(false);
    setFormPaymentMethod('Cash');
    setFormGstPercentage('');
    setFormCashAmount('');
    setFormUpiAmount('');
  };

  const handleCreateOrder = async (directReceive = false) => {
    if (formItems.length === 0) {
      toast.error(t('add_products'));
      return;
    }
    if (directReceive && formAmountPaid) {
      const parsedPaid = parseFloat(formAmountPaid);
      if (!isNaN(parsedPaid) && parsedPaid > formTotal) {
        toast.error('পরিশোধিত টাকা ক্রয়ের মোট পরিমাণের চেয়ে বেশি হতে পারবে না।');
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: (formSupplierId && formSupplierId !== 'none') ? formSupplierId : null,
          items: formItems.map((i) => ({
            productId: i.productId,
            quantity: parseFloat(i.quantity as string) || 0,
            unitPrice: parseFloat(i.unitPrice as string) || 0,
            gstPercentage: i.gstPercentage !== undefined && i.gstPercentage !== '' && !isNaN(parseFloat(i.gstPercentage as string)) ? parseFloat(i.gstPercentage as string) : undefined
          })),
          expectedDate: formExpectedDate || null,
          notes: formNotes || null,
          directReceive,
          amountPaid: (directReceive && formAmountPaid) ? parseFloat(formAmountPaid) : undefined,
          paymentMethod: directReceive ? formPaymentMethod : undefined,
          cashAmount: (directReceive && formPaymentMethod === 'Mixed') ? (parseFloat(formCashAmount) || 0) : undefined,
          upiAmount: (directReceive && formPaymentMethod === 'Mixed') ? (parseFloat(formUpiAmount) || 0) : undefined,
          gstPercentage: formGstPercentage ? parseFloat(formGstPercentage) : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (directReceive) {
          toast.success('ক্রয় সফল হয়েছে এবং স্টক আপডেট হয়েছে');
          // Update local stock in Zustand store and IndexedDB database
          try {
            const productsStore = useProductsStore.getState();
            const { ProductsDB } = await import('@/lib/offline/indexeddb');
            for (const item of formItems) {
              const parsedQty = parseFloat(item.quantity as string) || 0;
              productsStore.updateProductStock(item.productId, parsedQty);
              await ProductsDB.updateStock(item.productId, parsedQty);
            }
          } catch (dbError) {
            console.error('Failed to update local stock cache:', dbError);
          }
        } else {
          toast.success(t('order_created'));
        }
        setShowCreateDialog(false);
        resetForm();
        fetchOrders();
      } else {
        toast.error(data.error || tc('error'));
      }
    } catch {
      toast.error(tc('error'));
    } finally {
      setSaving(false);
    }
  };

  const handlePlaceOrder = async (order: PurchaseOrder) => {
    setSaving(true);
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, status: 'অর্ডার করা' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t('order_placed'));
        fetchOrders();
        if (selectedOrder?.id === order.id) {
          setSelectedOrder(data.data);
        }
      } else {
        toast.error(data.error || tc('error'));
      }
    } catch {
      toast.error(tc('error'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelOrder = async (order: PurchaseOrder) => {
    setSaving(true);
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, status: 'বাতিল' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t('order_cancelled'));
        setShowDetailDialog(false);
        fetchOrders();
      } else {
        toast.error(data.error || tc('error'));
      }
    } catch {
      toast.error(tc('error'));
    } finally {
      setSaving(false);
    }
  };

  const openReceiveDialog = (order: PurchaseOrder) => {
    setReceiveItems(
      order.items.map((item) => ({
        id: item.id,
        receivedQty: item.quantity,
        maxQty: item.quantity,
        productName: item.product?.nameBn || item.product?.name || item.productId,
        unit: item.product?.unit || 'piece',
      }))
    );
    setReceiveAmountPaid('');
    setReceivePaymentMethod('Cash');
    setReceiveCashAmount('');
    setReceiveUpiAmount('');
    setSelectedOrder(order);
    setShowReceiveDialog(true);
  };

  const handleReceiveOrder = async () => {
    if (!selectedOrder) return;
    const validItems = receiveItems.filter((i) => (parseFloat(i.receivedQty as string) || 0) > 0);
    if (validItems.length === 0) {
      toast.error(t('quantity'));
      return;
    }
    if (receiveAmountPaid) {
      const parsedPaid = parseFloat(receiveAmountPaid);
      const maxAllowed = selectedOrder.totalAmount - selectedOrder.paidAmount;
      if (!isNaN(parsedPaid) && parsedPaid > maxAllowed) {
        toast.error(`পরিশোধিত টাকা বকেয়া পরিমাণের (${formatPrice(maxAllowed)}) চেয়ে বেশি হতে পারবে না।`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/purchase-orders/${selectedOrder.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivedItems: validItems.map((i) => ({ id: i.id, receivedQty: i.receivedQty })),
          amountPaid: receiveAmountPaid ? parseFloat(receiveAmountPaid) : undefined,
          paymentMethod: receivePaymentMethod,
          cashAmount: receivePaymentMethod === 'Mixed' ? (parseFloat(receiveCashAmount) || 0) : undefined,
          upiAmount: receivePaymentMethod === 'Mixed' ? (parseFloat(receiveUpiAmount) || 0) : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t('order_received'), { description: t('stock_updated') });

        // Update local stock in Zustand store and IndexedDB database
        try {
          const productsStore = useProductsStore.getState();
          const { ProductsDB } = await import('@/lib/offline/indexeddb');
          for (const item of validItems) {
            const orderItem = selectedOrder.items.find((i) => i.id === item.id);
            if (orderItem) {
              const parsedRcvQty = parseFloat(item.receivedQty as string) || 0;
              productsStore.updateProductStock(orderItem.productId, parsedRcvQty);
              await ProductsDB.updateStock(orderItem.productId, parsedRcvQty);
            }
          }
        } catch (dbError) {
          console.error('Failed to update local stock cache:', dbError);
        }

        setShowReceiveDialog(false);
        setShowDetailDialog(false);
        fetchOrders();
      } else {
        toast.error(data.error || tc('error'));
      }
    } catch {
      toast.error(tc('error'));
    } finally {
      setSaving(false);
    }
  };

  const openDetailDialog = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setShowDetailDialog(true);
  };

  if (viewMode === 'statistics') {
    return <PurchaseStatistics onBack={() => setViewMode('list')} />;
  }

  return (
    <>
      <PurchaseOrderList
        totalOrders={totalOrders}
        pendingCount={pendingCount}
        receivedCount={receivedCount}
        totalValue={totalValue}
        formatPrice={formatPrice}
        formatDate={formatDate}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        customFrom={customFrom}
        setCustomFrom={setCustomFrom}
        customTo={customTo}
        setCustomTo={setCustomTo}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        loading={loading}
        filteredOrders={filteredOrders}
        onOpenDetail={openDetailDialog}
        onNewOrder={() => { resetForm(); setShowCreateDialog(true); }}
        onShowStatistics={() => setViewMode('statistics')}
      />

      <PurchaseOrderFormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        suppliers={suppliers}
        products={products}
        availableProducts={availableProducts}
        filteredProducts={filteredProducts}
        supplierProductIds={supplierProductIds}
        formSupplierId={formSupplierId}
        setFormSupplierId={setFormSupplierId}
        formSupplierName={formSupplierName}
        setFormSupplierName={setFormSupplierName}
        formItems={formItems}
        formExpectedDate={formExpectedDate}
        setFormExpectedDate={setFormExpectedDate}
        formNotes={formNotes}
        setFormNotes={setFormNotes}
        formAmountPaid={formAmountPaid}
        setFormAmountPaid={setFormAmountPaid}
        formProductId={formProductId}
        setFormProductId={setFormProductId}
        formProductName={formProductName}
        setFormProductName={setFormProductName}
        productSearch={productSearch}
        setProductSearch={setProductSearch}
        productOpen={productOpen}
        setProductOpen={setProductOpen}
        supplierSearch={supplierSearch}
        setSupplierSearch={setSupplierSearch}
        supplierOpen={supplierOpen}
        setSupplierOpen={setSupplierOpen}
        formPaymentMethod={formPaymentMethod}
        setFormPaymentMethod={setFormPaymentMethod}
        formGstPercentage={formGstPercentage}
        setFormGstPercentage={setFormGstPercentage}
        formCashAmount={formCashAmount}
        setFormCashAmount={setFormCashAmount}
        formUpiAmount={formUpiAmount}
        setFormUpiAmount={setFormUpiAmount}
        formSubtotal={formSubtotal}
        gstAmount={gstAmount}
        formTotal={formTotal}
        totalItemCount={totalItemCount}
        formPaidVal={formPaidVal}
        formDueAmount={formDueAmount}
        saving={saving}
        formatPrice={formatPrice}
        currencySymbol={currencySymbol}
        onAddFormItem={addFormItem}
        onRemoveFormItem={removeFormItem}
        onUpdateFormItem={updateFormItem}
        onCreateOrder={handleCreateOrder}
      />

      <PurchaseOrderDetailDialog
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
        selectedOrder={selectedOrder}
        saving={saving}
        formatPrice={formatPrice}
        formatDate={formatDate}
        onPlaceOrder={handlePlaceOrder}
        onReceiveOrder={openReceiveDialog}
        onCancelOrder={handleCancelOrder}
      />

      <ReceiveStockDialog
        open={showReceiveDialog}
        onOpenChange={setShowReceiveDialog}
        selectedOrder={selectedOrder}
        receiveItems={receiveItems}
        setReceiveItems={setReceiveItems}
        receiveAmountPaid={receiveAmountPaid}
        setReceiveAmountPaid={setReceiveAmountPaid}
        receivePaymentMethod={receivePaymentMethod}
        setReceivePaymentMethod={setReceivePaymentMethod}
        receiveCashAmount={receiveCashAmount}
        setReceiveCashAmount={setReceiveCashAmount}
        receiveUpiAmount={receiveUpiAmount}
        setReceiveUpiAmount={setReceiveUpiAmount}
        receiveTotal={receiveTotal}
        saving={saving}
        formatPrice={formatPrice}
        currencySymbol={currencySymbol}
        onReceive={handleReceiveOrder}
      />
    </>
  );
}
