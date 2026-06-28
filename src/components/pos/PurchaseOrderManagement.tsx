'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useProductsStore } from '@/stores/pos-store';
import { useNumberFormat } from '@/hooks/use-number-format';
import { Supplier } from '@/types/pos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn, convertBengaliToEnglishNumerals } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Plus, Package, Clock, Truck, CheckCircle, XCircle, Loader2, Trash2, ShoppingCart,
  Check, ChevronsUpDown, Calendar, BarChart2,
} from 'lucide-react';
import PurchaseStatistics from './PurchaseStatistics';

interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  receivedQty: number;
  product?: { id: string; name: string; nameBn: string; unit: string };
}

interface PurchaseOrder {
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

interface FormItem {
  productId: string;
  quantity: number;
  unitPrice: number | string;
  gstPercentage?: number | string;
}


const STATUS_CONFIG: Record<string, { color: string; icon: any }> = {
  'পেন্ডিং': { color: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100', icon: Clock },
  'অর্ডার করা': { color: 'bg-blue-100 text-blue-800 hover:bg-blue-100', icon: Truck },
  'প্রাপ্ত': { color: 'bg-green-100 text-green-800 hover:bg-green-100', icon: CheckCircle },
  'বাতিল': { color: 'bg-red-100 text-red-800 hover:bg-red-100', icon: XCircle },
};

export default function PurchaseOrderManagement() {
  const t = useTranslations('PurchaseOrders');
  const tb = useTranslations('Billing');
  const tc = useTranslations('Common');
  const { formatPrice, formatDate } = useNumberFormat();

  const products = useProductsStore((state) => state.products);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('সব');
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'statistics'>('list');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'weekly' | 'monthly' | 'custom'>('today');
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
  const [receiveItems, setReceiveItems] = useState<{ id: string; receivedQty: number; maxQty: number; productName: string }[]>([]);
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
      return sum + item.receivedQty * (orderItem?.unitPrice || 0);
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

  const filteredOrders = useMemo(() => {
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
  }, [orders, dateFilter, customFrom, customTo]);

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

  const generalGstRate = parseFloat(formGstPercentage) || 0;
  let formSubtotal = 0;
  let gstAmount = 0;
  formItems.forEach((item) => {
    const qty = item.quantity;
    const unitPrice = parseFloat(item.unitPrice as string) || 0;
    const itemSubtotal = Math.round((qty * unitPrice + Number.EPSILON) * 100) / 100;
    formSubtotal += itemSubtotal;

    const hasCustomGst = item.gstPercentage !== undefined && item.gstPercentage !== '' && !isNaN(parseFloat(item.gstPercentage as string));
    const itemGstRate = hasCustomGst ? parseFloat(item.gstPercentage as string) : generalGstRate;
    const itemGstAmount = Math.round((itemSubtotal * (itemGstRate / 100) + Number.EPSILON) * 100) / 100;
    gstAmount += itemGstAmount;
  });

  formSubtotal = Math.round((formSubtotal + Number.EPSILON) * 100) / 100;
  gstAmount = Math.round((gstAmount + Number.EPSILON) * 100) / 100;
  const formTotal = Math.round((formSubtotal + gstAmount + Number.EPSILON) * 100) / 100;
  const totalItemCount = formItems.reduce((sum, i) => sum + i.quantity, 0);

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
    setSaving(true);
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: (formSupplierId && formSupplierId !== 'none') ? formSupplierId : null,
          items: formItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
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
              productsStore.updateProductStock(item.productId, item.quantity);
              await ProductsDB.updateStock(item.productId, item.quantity);
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
    const validItems = receiveItems.filter((i) => i.receivedQty > 0);
    if (validItems.length === 0) {
      toast.error(t('quantity'));
      return;
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
              productsStore.updateProductStock(orderItem.productId, item.receivedQty);
              await ProductsDB.updateStock(orderItem.productId, item.receivedQty);
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

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || { color: 'bg-gray-100 text-gray-800', icon: Package };
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} gap-1`}>
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const getProductName = (item: PurchaseOrderItem) => {
    return item.product?.nameBn || item.product?.name || item.productId;
  };

  if (viewMode === 'statistics') {
    return <PurchaseStatistics onBack={() => setViewMode('list')} />;
  }

  return (
    <div className="h-full overflow-y-auto space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={() => setViewMode('statistics')}
            className="gap-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400"
          >
            <BarChart2 className="h-4 w-4" />
            রিপোর্ট
          </Button>
          <Button onClick={() => { resetForm(); setShowCreateDialog(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            {t('new_order')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t('total_orders')}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{totalOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">{t('pending')}</span>
            </div>
            <p className="text-2xl font-bold text-yellow-600 mt-1">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">{t('received')}</span>
            </div>
            <p className="text-2xl font-bold text-green-600 mt-1">{receivedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t('total_value')}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{formatPrice(totalValue)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 p-3 bg-muted/40 rounded-xl border border-border/40">
        <div className="flex flex-col gap-2 flex-1 w-full">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">তারিখ ফিল্টার:</span>
            <div className="flex gap-1 flex-wrap">
              {[
                { value: 'all', label: 'সব সময়' },
                { value: 'today', label: 'আজ' },
                { value: 'weekly', label: 'সাপ্তাহিক' },
                { value: 'monthly', label: 'মাসিক' },
                { value: 'custom', label: 'কাস্টম' },
              ].map((d) => (
                <Button
                  key={d.value}
                  variant={dateFilter === d.value ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setDateFilter(d.value as any)}
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>

          {dateFilter === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 mt-1.5 border-t pt-1.5 border-dashed border-border/60">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">থেকে:</Label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 text-xs w-[140px]"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">পর্যন্ত:</Label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 text-xs w-[140px]"
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
          )}
        </div>

        {/* Vertical divider on desktop */}
        <div className="hidden md:block self-stretch w-px bg-border/60" />

        <div className="flex flex-wrap items-center gap-2 md:pl-2 shrink-0">
          <span className="text-xs font-semibold text-muted-foreground">অবস্থা ফিল্টার:</span>
          <div className="flex gap-1 flex-wrap">
            {['সব', 'পেন্ডিং', 'অর্ডার করা', 'প্রাপ্ত', 'বাতিল'].map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setStatusFilter(status)}
              >
                {status}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Order List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">{tc('loading')}</span>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mb-2 opacity-50" />
          <p>{t('no_orders')}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredOrders.map((order) => (
            <Card key={order.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDetailDialog(order)}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold">{order.orderNumber}</span>
                      {getStatusBadge(order.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {order.supplier?.name || t('no_supplier')}
                      {' • '}
                      {t('items_count', { count: order.items.length })}
                    </p>
                    {order.expectedDate && (
                      <p className="text-xs text-muted-foreground">
                        {t('expected_date')}: {formatDate(new Date(order.expectedDate))}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold">{formatPrice(order.totalAmount)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(new Date(order.createdAt))}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('new_order')}</DialogTitle>
            <DialogDescription>{t('subtitle')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Supplier */}
            <div>
              <Label>{t('supplier')}</Label>
              <Popover open={supplierOpen} onOpenChange={setSupplierOpen} modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={supplierOpen}
                    className="w-full justify-between font-normal min-w-0"
                  >
                    <span className="truncate flex-1 text-left">
                      {formSupplierId === 'none'
                        ? t('no_supplier')
                        : formSupplierId
                          ? formSupplierName || suppliers.find((s) => s.id === formSupplierId)?.name
                          : t('select_supplier')}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start" side="bottom" avoidCollisions={false}>
                  <Command shouldFilter={false}>
                    <CommandInput
                      value={supplierSearch}
                      onValueChange={setSupplierSearch}
                      placeholder={t('search_supplier')}
                    />
                    <CommandList>
                      <CommandEmpty>{t('no_supplier_found')}</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="none"
                          onSelect={() => {
                            setFormSupplierId('none');
                            setFormSupplierName('');
                            setSupplierOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              formSupplierId === 'none' ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          {t('no_supplier')}
                        </CommandItem>
                        {suppliers.map((supplier) => (
                          <CommandItem
                            key={supplier.id}
                            value={`${supplier.name} ${supplier.phone ?? ''}`}
                            onSelect={() => {
                              setFormSupplierId(supplier.id);
                              setFormSupplierName(supplier.name);
                              setSupplierOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                formSupplierId === supplier.id ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <span className="truncate">{supplier.name}</span>
                            {supplier.phone && (
                              <span className="ml-auto text-xs text-muted-foreground">{supplier.phone}</span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Add Products */}
            <div>
              <Label>{t('add_products')}</Label>
              <div className="flex gap-2 mt-1">
                <Popover open={productOpen} onOpenChange={setProductOpen} modal={true}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={productOpen}
                      className="flex-1 justify-between font-normal min-w-0"
                    >
                      <span className="truncate flex-1 text-left">
                        {formProductId
                          ? formProductName || availableProducts.find((p) => p.id === formProductId)?.nameBn || availableProducts.find((p) => p.id === formProductId)?.name
                          : t('select_product')}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start" side="bottom" avoidCollisions={false}>
                    <Command shouldFilter={false}>
                      <CommandInput
                        value={productSearch}
                        onValueChange={setProductSearch}
                        placeholder={tb('search_products')}
                      />
                      <CommandList>
                        <CommandEmpty>{tb('no_products')}</CommandEmpty>
                        <CommandGroup>
                          {filteredProducts.map((product) => (
                            <CommandItem
                              key={product.id}
                              value={product.id}
                              onSelect={() => {
                                setFormProductId(product.id);
                                setFormProductName(product.nameBn || product.name);
                                setProductOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  formProductId === product.id ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              <span className="truncate">{product.nameBn || product.name}</span>
                              {supplierProductIds.has(product.id) && (
                                <Badge variant="secondary" className="ml-2 text-[10px] py-0 px-1 font-semibold text-indigo-600 bg-indigo-50 border-indigo-100 dark:bg-indigo-950/20 dark:text-indigo-400">
                                  সাপ্লায়ারের
                                </Badge>
                              )}
                              <span className="ml-auto text-xs text-muted-foreground shrink-0">
                                {formatPrice(Number(product.buyingPrice))}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Button onClick={addFormItem} variant="outline" size="icon" disabled={!formProductId}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Items Table / Cards */}
            {formItems.length > 0 && (
              <>
                {/* Desktop View */}
                <Card className="hidden md:block">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                          <TableRow>
                            <TableHead>{tc('name')}</TableHead>
                            <TableHead className="w-24">{t('quantity')}</TableHead>
                            <TableHead className="w-28">{t('unit_price')}</TableHead>
                            <TableHead className="w-24">জিএসটি (%)</TableHead>
                            <TableHead className="w-28">{t('total_price')}</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {formItems.map((item) => {
                            const product = products.find((p) => p.id === item.productId);
                            const qty = item.quantity;
                            const unitPrice = parseFloat(item.unitPrice as string) || 0;
                            const itemSubtotal = Math.round((qty * unitPrice + Number.EPSILON) * 100) / 100;
                            const hasCustomGst = item.gstPercentage !== undefined && item.gstPercentage !== '' && !isNaN(parseFloat(item.gstPercentage as string));
                            const itemGstRate = hasCustomGst ? parseFloat(item.gstPercentage as string) : (parseFloat(formGstPercentage) || 0);
                            const itemGstAmount = Math.round((itemSubtotal * (itemGstRate / 100) + Number.EPSILON) * 100) / 100;
                            const itemTotalIncludingGst = Math.round((itemSubtotal + itemGstAmount + Number.EPSILON) * 100) / 100;

                            return (
                              <TableRow key={item.productId}>
                                <TableCell className="text-sm">{product?.nameBn || product?.name}</TableCell>
                                <TableCell>
                                  <Input
                                    id={`qty-${item.productId}`}
                                    type="text"
                                    value={item.quantity === 0 ? '' : item.quantity}
                                    onChange={(e) => {
                                      const val = convertBengaliToEnglishNumerals(e.target.value);
                                      const cleaned = val.replace(/[^0-9]/g, '');
                                      updateFormItem(item.productId, 'quantity', parseInt(cleaned) || 0);
                                    }}
                                    onBlur={() => {
                                      if (item.quantity <= 0) {
                                        updateFormItem(item.productId, 'quantity', 1);
                                      }
                                    }}
                                    className="h-8 w-20"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="text"
                                    value={item.unitPrice === 0 ? '' : item.unitPrice}
                                    onChange={(e) => {
                                      const val = convertBengaliToEnglishNumerals(e.target.value);
                                      const cleaned = val.replace(/[^0-9.]/g, '');
                                      const dotCount = (cleaned.match(/\./g) || []).length;
                                      if (dotCount > 1) return;
                                      updateFormItem(item.productId, 'unitPrice', cleaned);
                                    }}
                                    onBlur={() => {
                                      const parsedPrice = parseFloat(item.unitPrice as string) || 0;
                                      if (parsedPrice < 0) {
                                        updateFormItem(item.productId, 'unitPrice', 0);
                                      } else {
                                        updateFormItem(item.productId, 'unitPrice', parsedPrice);
                                      }
                                    }}
                                    className="h-8 w-24"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="text"
                                    value={item.gstPercentage === undefined ? '' : item.gstPercentage}
                                    onChange={(e) => {
                                      const val = convertBengaliToEnglishNumerals(e.target.value);
                                      const cleaned = val.replace(/[^0-9.]/g, '');
                                      const dotCount = (cleaned.match(/\./g) || []).length;
                                      if (dotCount > 1) return;
                                      updateFormItem(item.productId, 'gstPercentage', cleaned);
                                    }}
                                    onBlur={() => {
                                      const parsedGst = parseFloat(item.gstPercentage as string);
                                      if (isNaN(parsedGst)) {
                                        updateFormItem(item.productId, 'gstPercentage', '');
                                      } else if (parsedGst < 0) {
                                        updateFormItem(item.productId, 'gstPercentage', 0);
                                      } else {
                                        updateFormItem(item.productId, 'gstPercentage', parsedGst);
                                      }
                                    }}
                                    placeholder={formGstPercentage || "0"}
                                    className="h-8 w-20"
                                  />
                                </TableCell>
                                <TableCell className="font-medium">{formatPrice(itemTotalIncludingGst)}</TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="sm" onClick={() => removeFormItem(item.productId)}>
                                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Mobile View */}
                <div className="md:hidden flex flex-col gap-3">
                  {formItems.map((item) => {
                    const product = products.find((p) => p.id === item.productId);
                    const qty = item.quantity;
                    const unitPrice = parseFloat(item.unitPrice as string) || 0;
                    const itemSubtotal = Math.round((qty * unitPrice + Number.EPSILON) * 100) / 100;
                    const hasCustomGst = item.gstPercentage !== undefined && item.gstPercentage !== '' && !isNaN(parseFloat(item.gstPercentage as string));
                    const itemGstRate = hasCustomGst ? parseFloat(item.gstPercentage as string) : (parseFloat(formGstPercentage) || 0);
                    const itemGstAmount = Math.round((itemSubtotal * (itemGstRate / 100) + Number.EPSILON) * 100) / 100;
                    const itemTotalIncludingGst = Math.round((itemSubtotal + itemGstAmount + Number.EPSILON) * 100) / 100;

                    return (
                      <Card key={`mobile-${item.productId}`} className="p-3">
                        <div className="flex justify-between items-start mb-3 gap-2">
                          <span className="text-sm font-semibold">{product?.nameBn || product?.name}</span>
                          <Button variant="ghost" size="sm" onClick={() => removeFormItem(item.productId)} className="h-6 w-6 p-0 shrink-0">
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t('quantity')}</Label>
                            <Input
                              id={`qty-mobile-${item.productId}`}
                              type="text"
                              value={item.quantity === 0 ? '' : item.quantity}
                              onChange={(e) => {
                                const val = convertBengaliToEnglishNumerals(e.target.value);
                                const cleaned = val.replace(/[^0-9]/g, '');
                                updateFormItem(item.productId, 'quantity', parseInt(cleaned) || 0);
                              }}
                              onBlur={() => {
                                if (item.quantity <= 0) {
                                  updateFormItem(item.productId, 'quantity', 1);
                                }
                              }}
                              className="h-8 w-full"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t('unit_price')}</Label>
                            <Input
                              type="text"
                              value={item.unitPrice === 0 ? '' : item.unitPrice}
                              onChange={(e) => {
                                const val = convertBengaliToEnglishNumerals(e.target.value);
                                const cleaned = val.replace(/[^0-9.]/g, '');
                                const dotCount = (cleaned.match(/\./g) || []).length;
                                if (dotCount > 1) return;
                                updateFormItem(item.productId, 'unitPrice', cleaned);
                              }}
                              onBlur={() => {
                                const parsedPrice = parseFloat(item.unitPrice as string) || 0;
                                if (parsedPrice < 0) {
                                  updateFormItem(item.productId, 'unitPrice', 0);
                                } else {
                                  updateFormItem(item.productId, 'unitPrice', parsedPrice);
                                }
                              }}
                              className="h-8 w-full"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">জিএসটি (%)</Label>
                            <Input
                              type="text"
                              value={item.gstPercentage === undefined ? '' : item.gstPercentage}
                              onChange={(e) => {
                                const val = convertBengaliToEnglishNumerals(e.target.value);
                                const cleaned = val.replace(/[^0-9.]/g, '');
                                const dotCount = (cleaned.match(/\./g) || []).length;
                                if (dotCount > 1) return;
                                updateFormItem(item.productId, 'gstPercentage', cleaned);
                              }}
                              onBlur={() => {
                                const parsedGst = parseFloat(item.gstPercentage as string);
                                if (isNaN(parsedGst)) {
                                  updateFormItem(item.productId, 'gstPercentage', '');
                                } else if (parsedGst < 0) {
                                  updateFormItem(item.productId, 'gstPercentage', 0);
                                } else {
                                  updateFormItem(item.productId, 'gstPercentage', parsedGst);
                                }
                              }}
                              placeholder={formGstPercentage || "0"}
                              className="h-8 w-full"
                            />
                          </div>
                        </div>
                        <div className="flex justify-between items-center mt-3 pt-2 border-t text-sm">
                          <span className="text-muted-foreground">{t('total_price')}:</span>
                          <span className="font-bold">{formatPrice(itemTotalIncludingGst)}</span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}

            {/* Calculations Area */}
            {formItems.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-2 border border-border/50">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">সাবটোটাল ({formItems.length} প্রকার, {totalItemCount} আইটেম):</span>
                  <span className="font-semibold">{formatPrice(formSubtotal)}</span>
                </div>
                
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">জিএসটি (অপশনাল):</span>
                    <div className="relative w-20">
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="0"
                        value={formGstPercentage}
                        onChange={(e) => setFormGstPercentage(e.target.value)}
                        className="h-7 text-xs pr-6"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                    </div>
                  </div>
                  <span className="font-medium text-muted-foreground">{gstAmount > 0 ? '+' : ''}{formatPrice(gstAmount)}</span>
                </div>
                
                <Separator className="my-1" />
                
                <div className="flex justify-between items-center">
                  <span className="font-bold text-base">মোট:</span>
                  <span className="font-bold text-xl text-primary">{formatPrice(formTotal)}</span>
                </div>

                {formPaidVal > 0 && (
                  <div className="flex justify-between items-center text-sm border-t pt-1 border-dashed border-border/50">
                    <span className="text-muted-foreground">পরিশোধিত টাকা:</span>
                    <span className="font-medium text-green-600 dark:text-green-400">{formatPrice(formPaidVal)}</span>
                  </div>
                )}
                {formDueAmount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-red-500 font-medium">বকেয়া (Due):</span>
                    <span className="font-bold text-red-600 dark:text-red-400">{formatPrice(formDueAmount)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Expected Date */}
            <div>
              <Label>{t('expected_date')}</Label>
              <Input
                type="date"
                value={formExpectedDate}
                onChange={(e) => setFormExpectedDate(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div>
              <Label>{t('notes')}</Label>
              <Textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="অতিরিক্ত নোট..."
              />
            </div>

            {/* Amount Paid */}
            <div className="space-y-1.5">
              <Label htmlFor="form-amount-paid" className="text-sm font-medium">পরিশোধিত টাকা (ঐচ্ছিক)</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">৳</span>
                <Input
                  id="form-amount-paid"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formAmountPaid}
                  onChange={(e) => {
                    const cleaned = convertBengaliToEnglishNumerals(e.target.value);
                    setFormAmountPaid(cleaned);
                  }}
                  placeholder={Math.round(formTotal).toString()}
                  className="pl-8"
                  readOnly={formPaymentMethod === 'Mixed'}
                />
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-1.5">
              <Label htmlFor="form-payment-method" className="text-sm font-medium">পেমেন্ট পদ্ধতি</Label>
              <Select value={formPaymentMethod} onValueChange={setFormPaymentMethod}>
                <SelectTrigger id="form-payment-method" className="h-9">
                  <SelectValue placeholder="পেমেন্ট পদ্ধতি নির্বাচন করুন" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash (নগদ)</SelectItem>
                  <SelectItem value="UPI">UPI (ইউপিআই)</SelectItem>
                  <SelectItem value="Mixed">Mixed (মিশ্র)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formPaymentMethod === 'Mixed' && (
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="space-y-1">
                  <Label htmlFor="form-cash-amount" className="text-xs">নগদ পরিমাণ</Label>
                  <Input
                    id="form-cash-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formCashAmount}
                    onChange={(e) => setFormCashAmount(e.target.value)}
                    placeholder="নগদ"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="form-upi-amount" className="text-xs">ইউপিআই পরিমাণ</Label>
                  <Input
                    id="form-upi-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formUpiAmount}
                    onChange={(e) => setFormUpiAmount(e.target.value)}
                    placeholder="ইউপিআই"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 flex-wrap sm:justify-end">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{tc('cancel')}</Button>
            <Button onClick={() => handleCreateOrder(true)} disabled={saving || formItems.length === 0} className="bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              সরাসরি ক্রয় ও স্টক আপডেট
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('order_details')}</DialogTitle>
            <DialogDescription>{selectedOrder?.orderNumber}</DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              {/* Order Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">{t('order_number')}</p>
                  <p className="font-mono font-bold">{selectedOrder.orderNumber}</p>
                </div>
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">{tc('status')}</p>
                  <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
                </div>
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">{t('supplier')}</p>
                  <p className="font-medium">{selectedOrder.supplier?.name || t('no_supplier')}</p>
                </div>
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">{t('total_price')}</p>
                  <p className="font-bold">{formatPrice(selectedOrder.totalAmount)}</p>
                </div>
              </div>

              {selectedOrder.expectedDate && (
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">{t('expected_date')}</p>
                  <p className="font-medium">{formatDate(new Date(selectedOrder.expectedDate))}</p>
                </div>
              )}

              {selectedOrder.notes && (
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">{t('notes')}</p>
                  <p className="text-sm">{selectedOrder.notes}</p>
                </div>
              )}

              <Separator />

              {/* Items */}
              <div>
                <h4 className="font-medium mb-2">{t('items_count', { count: selectedOrder.items.length })}</h4>
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto max-h-[250px] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                          <TableRow>
                            <TableHead>{tc('name')}</TableHead>
                            <TableHead className="text-right">{t('quantity')}</TableHead>
                            <TableHead className="text-right">{t('unit_price')}</TableHead>
                            <TableHead className="text-right">{t('total_price')}</TableHead>
                            {selectedOrder.status === 'প্রাপ্ত' && (
                              <TableHead className="text-right">{t('received_qty')}</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedOrder.items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="text-sm">{getProductName(item)}</TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right">{formatPrice(item.unitPrice)}</TableCell>
                              <TableCell className="text-right font-medium">{formatPrice(item.totalPrice)}</TableCell>
                              {selectedOrder.status === 'প্রাপ্ত' && (
                                <TableCell className="text-right text-green-600">{item.receivedQty}</TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="bg-muted p-3 rounded-lg flex justify-between items-center">
                <span className="text-muted-foreground">{t('total_price')}</span>
                <span className="text-xl font-bold">{formatPrice(selectedOrder.totalAmount)}</span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap">
                {selectedOrder.status === 'পেন্ডিং' && (
                  <Button onClick={() => handlePlaceOrder(selectedOrder)} disabled={saving} className="gap-2">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Truck className="h-4 w-4" />
                    {t('place_order')}
                  </Button>
                )}
                {(selectedOrder.status === 'পেন্ডিং' || selectedOrder.status === 'অর্ডার করা') && (
                  <>
                    <Button onClick={() => openReceiveDialog(selectedOrder)} variant="outline" className="gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      {t('receive_order')}
                    </Button>
                    <Button onClick={() => handleCancelOrder(selectedOrder)} variant="destructive" className="gap-2" disabled={saving}>
                      <XCircle className="h-4 w-4" />
                      {t('cancel_order')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('receive_order')}</DialogTitle>
            <DialogDescription>{selectedOrder?.orderNumber}</DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                প্রাপ্ত পরিমাণ লিখুন। অর্ডার প্রাপ্ত হলে স্টক স্বয়ংক্রিয়ভাবে আপডেট হবে।
              </p>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[250px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead>পণ্য</TableHead>
                          <TableHead className="text-right">অর্ডার</TableHead>
                          <TableHead className="text-right">{t('received_qty')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receiveItems.map((item, idx) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-sm">{item.productName}</TableCell>
                            <TableCell className="text-right">{item.maxQty}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="text"
                                value={item.receivedQty === 0 ? '' : item.receivedQty}
                                onChange={(e) => {
                                  const val = convertBengaliToEnglishNumerals(e.target.value);
                                  const cleaned = val.replace(/[^0-9]/g, '');
                                  const intVal = parseInt(cleaned) || 0;
                                  const finalVal = Math.min(intVal, item.maxQty);
                                  const newItems = [...receiveItems];
                                  newItems[idx] = { ...newItems[idx], receivedQty: finalVal };
                                  setReceiveItems(newItems);
                                }}
                                onBlur={() => {
                                  if (item.receivedQty < 0) {
                                    const newItems = [...receiveItems];
                                    newItems[idx] = { ...newItems[idx], receivedQty: 0 };
                                    setReceiveItems(newItems);
                                  }
                                }}
                                className="h-8 w-20 ml-auto"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Running Total & Amount Paid for Receive Dialog */}
              {receiveTotal > 0 && (() => {
                const receivePaidVal = parseFloat(receiveAmountPaid) || 0;
                const receiveDueAmount = Math.round((receiveTotal - receivePaidVal + Number.EPSILON) * 100) / 100;
                return (
                  <div className="space-y-3 p-3 bg-muted rounded-lg">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">প্রাপ্ত মালপত্রের মোট মূল্য:</span>
                      <span className="font-bold">{formatPrice(receiveTotal)}</span>
                    </div>
                    {selectedOrder.supplierId && (
                      <div className="space-y-1.5 border-t pt-2.5">
                        <Label htmlFor="receive-amount-paid" className="text-xs">পরিশোধিত টাকা (ঐচ্ছিক)</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">৳</span>
                          <Input
                            id="receive-amount-paid"
                            type="text"
                            value={receiveAmountPaid}
                            onChange={(e) => {
                              const val = convertBengaliToEnglishNumerals(e.target.value);
                              const cleaned = val.replace(/[^0-9.]/g, '');
                              const dotCount = (cleaned.match(/\./g) || []).length;
                              if (dotCount > 1) return;
                              setReceiveAmountPaid(cleaned);
                            }}
                            placeholder="সম্পূর্ণ পরিশোধিত হলে ফাঁকা রাখুন"
                            className="pl-9 h-8 text-sm bg-background"
                            readOnly={receivePaymentMethod === 'Mixed'}
                          />
                        </div>
                      </div>
                    )}

                    {receivePaidVal > 0 && (
                      <div className="flex justify-between items-center text-sm border-t pt-1 border-dashed border-border/50">
                        <span className="text-muted-foreground">পরিশোধিত টাকা:</span>
                        <span className="font-medium text-green-600 dark:text-green-400">{formatPrice(receivePaidVal)}</span>
                      </div>
                    )}
                    {receiveDueAmount > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-red-500 font-medium">বকেয়া (Due):</span>
                        <span className="font-bold text-red-600 dark:text-red-400">{formatPrice(receiveDueAmount)}</span>
                      </div>
                    )}

                  {/* Payment Method for Receive Dialog */}
                  {selectedOrder.supplierId && (
                    <div className="space-y-1.5 border-t pt-2.5">
                      <Label htmlFor="receive-payment-method" className="text-xs">পেমেন্ট পদ্ধতি</Label>
                      <Select value={receivePaymentMethod} onValueChange={setReceivePaymentMethod}>
                        <SelectTrigger id="receive-payment-method" className="h-8 text-sm bg-background">
                          <SelectValue placeholder="পেমেন্ট পদ্ধতি নির্বাচন করুন" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Cash">Cash (নগদ)</SelectItem>
                          <SelectItem value="UPI">UPI (ইউপিআই)</SelectItem>
                          <SelectItem value="Mixed">Mixed (মিশ্র)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {receivePaymentMethod === 'Mixed' && (
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <div className="space-y-1">
                        <Label htmlFor="receive-cash-amount" className="text-xs">নগদ পরিমাণ</Label>
                        <Input
                          id="receive-cash-amount"
                          type="number"
                          min="0"
                          step="0.01"
                          value={receiveCashAmount}
                          onChange={(e) => setReceiveCashAmount(e.target.value)}
                          placeholder="নগদ"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="receive-upi-amount" className="text-xs">ইউপিআই পরিমাণ</Label>
                        <Input
                          id="receive-upi-amount"
                          type="number"
                          min="0"
                          step="0.01"
                          value={receiveUpiAmount}
                          onChange={(e) => setReceiveUpiAmount(e.target.value)}
                          placeholder="ইউপিআই"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReceiveDialog(false)}>{tc('cancel')}</Button>
            <Button onClick={handleReceiveOrder} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('receive_order')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
