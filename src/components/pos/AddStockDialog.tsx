'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Package, Calendar, User, IndianRupee } from 'lucide-react';
import type { Product, Supplier } from '@/types/pos';
import { useProductsStore } from '@/stores/pos-store';
import { cn, convertBengaliToEnglishNumerals } from '@/lib/utils';

interface AddStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  suppliers?: Supplier[];
  onSubmit?: (data: StockEntryData) => void;
}

export interface StockEntryData {
  productId: string;
  quantity: number;
  purchasePrice: number;
  date: Date;
  supplierId?: string;
  notes?: string;
}

// Mock suppliers for demo
const mockSuppliers: Supplier[] = [
  { id: '1', name: 'ABC Distributors', phone: '9876543210', isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: '2', name: 'XYZ Wholesalers', phone: '9876543211', isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: '3', name: 'Direct Supply Co', phone: '9876543212', isActive: true, createdAt: new Date(), updatedAt: new Date() },
];

export function AddStockDialog({
  open,
  onOpenChange,
  product: initialProduct,
  suppliers = mockSuppliers,
  onSubmit,
}: AddStockDialogProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [purchasePrice, setPurchasePrice] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [supplierId, setSupplierId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [liveSupplers, setLiveSuppliers] = useState<Supplier[]>(suppliers);

  const products = useProductsStore((state) => state.products);
  const selectedProduct = products.find(p => p.id === selectedProductId);

  // Fetch suppliers from database when dialog opens
  useEffect(() => {
    if (open) {
      fetch('/api/suppliers')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data) {
            setLiveSuppliers(data.data);
          }
        })
        .catch(err => {
          console.error('Failed to load suppliers:', err);
          setLiveSuppliers(suppliers);
        });
    }
  }, [open, suppliers]);

  // Set initial product if provided
  useEffect(() => {
    if (initialProduct && open) {
      setSelectedProductId(initialProduct.id);
      setPurchasePrice(initialProduct.buyingPrice.toString());
    }
  }, [initialProduct, open]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open && !initialProduct) {
      setSelectedProductId('');
      setQuantity('');
      setPurchasePrice('');
      setDate(new Date().toISOString().split('T')[0]);
      setSupplierId('');
      setNotes('');
    }
  }, [open, initialProduct]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const handleSubmit = async () => {
    if (!selectedProductId || !quantity || !purchasePrice) return;

    setIsSubmitting(true);
    try {
      const data: StockEntryData = {
        productId: selectedProductId,
        quantity: parseFloat(quantity),
        purchasePrice: parseFloat(purchasePrice),
        date: new Date(date),
        supplierId: supplierId || undefined,
        notes: notes || undefined,
      };

      onSubmit?.(data);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = selectedProductId && quantity && parseFloat(quantity) > 0 && purchasePrice && parseFloat(purchasePrice) >= 0;

  // Calculate total
  const total = (parseFloat(quantity) || 0) * (parseFloat(purchasePrice) || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-106.25 w-[95vw] max-h-[90dvh] overflow-y-auto p-4 md:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Add Stock Entry
          </DialogTitle>
          <DialogDescription>
            Record a new stock purchase entry
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Product Select */}
          <div className="space-y-2">
            <Label htmlFor="add-stock-product">Product *</Label>
            <Select
              value={selectedProductId}
              onValueChange={setSelectedProductId}
              disabled={!!initialProduct}
            >
              <SelectTrigger id="add-stock-product">
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products.filter(p => p.isActive).map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    <div className="flex items-center justify-between gap-4">
                      <span>{product.name}</span>
                      <Badge variant="outline" className="text-xs">
                        Stock: {product.currentStock}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProduct && (
              <p className="text-xs text-muted-foreground">
                Current stock: {selectedProduct.currentStock} {selectedProduct.unit} • 
                Min level: {selectedProduct.minStockLevel}
              </p>
            )}
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="add-stock-quantity">Quantity *</Label>
            <div className="flex items-center gap-2">
              <Input
                id="add-stock-quantity"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(convertBengaliToEnglishNumerals(e.target.value))}
                placeholder="0"
                min="0"
                step={['kg', 'liter'].includes(selectedProduct?.unit || '') ? '0.1' : '1'}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground w-16">
                {selectedProduct?.unit || 'units'}
              </span>
            </div>
          </div>

          {/* Purchase Price */}
          <div className="space-y-2">
              <Label htmlFor="add-stock-price">Purchase Price (per unit) *</Label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="add-stock-price"
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(convertBengaliToEnglishNumerals(e.target.value))}
                placeholder="0"
                min="0"
                step="0.01"
                className="pl-9"
              />
            </div>
            {selectedProduct && (
              <p className="text-xs text-muted-foreground">
                Usual price: {formatPrice(selectedProduct.buyingPrice)} • 
                Selling: {formatPrice(selectedProduct.sellingPrice)}
              </p>
            )}
          </div>

          {/* Total */}
          {total > 0 && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Amount</span>
                <span className="text-lg font-bold">{formatPrice(total)}</span>
              </div>
            </div>
          )}

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="add-stock-date" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Date
            </Label>
            <Input
              id="add-stock-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Supplier */}
          <div className="space-y-2">
            <Label htmlFor="add-stock-supplier" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Supplier (Optional)
            </Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger id="add-stock-supplier">
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {liveSupplers.filter(s => s.isActive).map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="add-stock-notes">Notes (Optional)</Label>
            <Input
              id="add-stock-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Invoice number, remarks..."
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSubmitting} className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
            {isSubmitting ? 'Saving...' : 'Add Stock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddStockDialog;
