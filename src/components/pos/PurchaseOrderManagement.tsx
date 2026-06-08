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
import { cn, convertBengaliToEnglishNumerals } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Plus, Package, Clock, Truck, CheckCircle, XCircle, Loader2, Trash2, ShoppingCart,
  Check, ChevronsUpDown,
} from 'lucide-react';

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
  unitPrice: number;
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
  const [formProductId, setFormProductId] = useState('');
  const [formProductName, setFormProductName] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productOpen, setProductOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierOpen, setSupplierOpen] = useState(false);

  // Receive form state
  const [receiveItems, setReceiveItems] = useState<{ id: string; receivedQty: number; maxQty: number; productName: string }[]>([]);

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

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim();
    if (!q) return availableProducts;
    const lowerQuery = q.toLowerCase();
    const normalizedQuery = convertBengaliToEnglishNumerals(q);
    return availableProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(lowerQuery) ||
        p.nameBn?.includes(q) ||
        p.barcode?.includes(q) ||
        convertBengaliToEnglishNumerals(p.barcode || '').includes(normalizedQuery) ||
        p.category.toLowerCase().includes(lowerQuery)
    );
  }, [availableProducts, productSearch]);

  const totalOrders = orders.length;
  const pendingCount = orders.filter((o) => o.status === 'পেন্ডিং').length;
  const receivedCount = orders.filter((o) => o.status === 'প্রাপ্ত').length;
  const totalValue = orders.reduce((sum, o) => sum + o.totalAmount, 0);

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
    setFormItems([...formItems, { productId: formProductId, quantity: 1, unitPrice: Number(product.buyingPrice) }]);
    setFormProductId('');
    setFormProductName('');
    setProductSearch('');
    setProductOpen(false);
  };

  const removeFormItem = (productId: string) => {
    setFormItems(formItems.filter((i) => i.productId !== productId));
  };

  const updateFormItem = (productId: string, field: 'quantity' | 'unitPrice', value: number) => {
    setFormItems(formItems.map((i) => (i.productId === productId ? { ...i, [field]: value } : i)));
  };

  const formTotal = formItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  const resetForm = () => {
    setFormSupplierId('');
    setFormSupplierName('');
    setFormItems([]);
    setFormExpectedDate('');
    setFormNotes('');
    setFormProductId('');
    setFormProductName('');
    setProductSearch('');
    setProductOpen(false);
    setSupplierSearch('');
    setSupplierOpen(false);
  };

  const handleCreateOrder = async () => {
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
          items: formItems.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
          expectedDate: formExpectedDate || null,
          notes: formNotes || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(t('order_created'));
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

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreateDialog(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          {t('new_order')}
        </Button>
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

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{tc('filter')}:</span>
        <div className="flex gap-1 flex-wrap">
          {['সব', 'পেন্ডিং', 'অর্ডার করা', 'প্রাপ্ত', 'বাতিল'].map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status)}
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      {/* Order List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">{tc('loading')}</span>
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mb-2 opacity-50" />
          <p>{t('no_orders')}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {orders.map((order) => (
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

      {/* Create Order Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('new_order')}</DialogTitle>
            <DialogDescription>{t('subtitle')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Supplier */}
            <div>
              <Label>{t('supplier')}</Label>
              <Popover open={supplierOpen} onOpenChange={setSupplierOpen} modal={false}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={supplierOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {formSupplierId === 'none'
                        ? t('no_supplier')
                        : formSupplierId
                          ? formSupplierName || suppliers.find((s) => s.id === formSupplierId)?.name
                          : t('select_supplier')}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                  <Command>
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
                <Popover open={productOpen} onOpenChange={setProductOpen} modal={false}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={productOpen}
                      className="flex-1 justify-between font-normal"
                    >
                      <span className="truncate">
                        {formProductId
                          ? formProductName || availableProducts.find((p) => p.id === formProductId)?.nameBn || availableProducts.find((p) => p.id === formProductId)?.name
                          : t('select_product')}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
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

            {/* Items Table */}
            {formItems.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{tc('name')}</TableHead>
                          <TableHead className="w-24">{t('quantity')}</TableHead>
                          <TableHead className="w-28">{t('unit_price')}</TableHead>
                          <TableHead className="w-28">{t('total_price')}</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {formItems.map((item) => {
                          const product = products.find((p) => p.id === item.productId);
                          return (
                            <TableRow key={item.productId}>
                              <TableCell className="text-sm">{product?.nameBn || product?.name}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => updateFormItem(item.productId, 'quantity', parseInt(e.target.value) || 0)}
                                  className="h-8 w-20"
                                  min={1}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.unitPrice}
                                  onChange={(e) => updateFormItem(item.productId, 'unitPrice', parseFloat(e.target.value) || 0)}
                                  className="h-8 w-24"
                                  min={0}
                                />
                              </TableCell>
                              <TableCell className="font-medium">{formatPrice(item.quantity * item.unitPrice)}</TableCell>
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
            )}

            {/* Running Total */}
            {formItems.length > 0 && (
              <div className="bg-muted p-3 rounded-lg text-sm flex justify-between">
                <span className="text-muted-foreground">{t('total_price')}</span>
                <span className="font-bold text-lg">{formatPrice(formTotal)}</span>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{tc('cancel')}</Button>
            <Button onClick={handleCreateOrder} disabled={saving || formItems.length === 0}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('create_order')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
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

      {/* Receive Order Dialog */}
      <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
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
                                type="number"
                                value={item.receivedQty}
                                onChange={(e) => {
                                  const val = Math.min(parseInt(e.target.value) || 0, item.maxQty);
                                  const newItems = [...receiveItems];
                                  newItems[idx] = { ...newItems[idx], receivedQty: val };
                                  setReceiveItems(newItems);
                                }}
                                className="h-8 w-20 ml-auto"
                                min={0}
                                max={item.maxQty}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
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
