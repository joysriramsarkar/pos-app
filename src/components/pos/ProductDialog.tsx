'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
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
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Package, Barcode, RefreshCw, Languages, ScanLine, X } from 'lucide-react';
import type { Product } from '@/types/pos';
import { useProductsStore } from '@/stores/pos-store';
import { cn, convertBengaliToEnglishNumerals } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { CameraScannerDialog } from './CameraScannerDialog';
import { useCameraBarcodeScanner } from '@/hooks/use-camera-barcode-scanner';
import { Capacitor } from '@capacitor/core';

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onSubmit?: (data: ProductFormData) => void;
}

export interface ProductFormData {
  id?: string;
  name: string;
  nameBn?: string;
  barcode?: string;
  category: string;
  buyingPrice: number;
  sellingPrice: number;
  unit: string;
  currentStock: number;
  minStockLevel: number;
  isActive: boolean;
}

const UNITS = [
  { value: 'piece', label: 'Piece (পিস)' },
  { value: 'kg', label: 'Kilogram (কেজি)' },
  { value: 'gram', label: 'Gram (গ্রাম)' },
  { value: 'liter', label: 'Liter (লিটার)' },
  { value: 'ml', label: 'Milliliter (মিলি)' },
  { value: 'packet', label: 'Packet (প্যাকেট)' },
  { value: 'bottle', label: 'Bottle (বোতল)' },
  { value: 'dozen', label: 'Dozen (ডজন)' },
  { value: 'box', label: 'Box (বাক্স)' },
];

const DEFAULT_CATEGORIES = [
  'Groceries',
  'Dairy',
  'Vegetables',
  'Fruits',
  'Pulses',
  'Oils',
  'Snacks',
  'Beverages',
  'Household',
  'Personal Care',
  'Other',
];

// Helper to generate barcode
const generateBarcode = (): string => {
  // Generate a 13-digit EAN-like barcode
  const prefix = '890'; // India prefix

  // Use crypto API for secure random number generation
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);

  // Modulo 10^9 to get a 9-digit number
  const random = (array[0] % 1000000000).toString().padStart(9, '0');

  const base = prefix + random;
  
  // Calculate check digit (Luhn algorithm for EAN)
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  
  return base + checkDigit;
};

export function ProductDialog({
  open,
  onOpenChange,
  product,
  onSubmit,
}: ProductDialogProps) {
  const [name, setName] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [buyingPrice, setBuyingPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [unit, setUnit] = useState('piece');
  const [currentStock, setCurrentStock] = useState('');
  const [minStockLevel, setMinStockLevel] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isWebScannerOpen, setIsWebScannerOpen] = useState(false);
  const [isNameBnTouched, setIsNameBnTouched] = useState(false);

  const isNativeApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

  const { scannerId, isInitialized, startShutdown } = useCameraBarcodeScanner({
    enabled: isWebScannerOpen,
    onBarcodeDetected: (code) => {
      setBarcode(code);
      startShutdown();
    },
    onClose: () => setIsWebScannerOpen(false),
  });

  const { toast } = useToast();
  const categories = useProductsStore((state) => state.categories);
  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...categories])].sort();

  const isEditing = !!product;

  // Populate form when editing
  useEffect(() => {
    if (open) {
      if (product) {
        setName(product.name);
        setNameBn(product.nameBn || '');
        setBarcode(product.barcode || '');
        setCategory(product.category);
        setBuyingPrice(product.buyingPrice.toString());
        setSellingPrice(product.sellingPrice.toString());
        setUnit(product.unit);
        setCurrentStock(product.currentStock.toString());
        setMinStockLevel(product.minStockLevel.toString());
        setIsActive(product.isActive);
        setIsNameBnTouched(true);
      } else {
        // Reset for new product
        setName('');
        setNameBn('');
        setBarcode('');
        setCategory('');
        setNewCategory('');
        setBuyingPrice('');
        setSellingPrice('');
        setUnit('piece');
        setCurrentStock('0');
        setMinStockLevel('5');
        setIsActive(true);
        setIsNameBnTouched(false);
      }
    }
  }, [open, product]);

  // Auto-translate name to Bengali
  useEffect(() => {
    if (!name.trim()) {
      if (!isNameBnTouched) setNameBn('');
      return;
    }
    
    const timeoutId = setTimeout(async () => {
      if (!isNameBnTouched) {
        try {
          // Convert English digits to Bengali digits first
          const englishDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
          const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
          let digitConvertedName = name.trim();
          for (let i = 0; i < englishDigits.length; i++) {
            digitConvertedName = digitConvertedName.split(englishDigits[i]).join(bengaliDigits[i]);
          }

          const processedName = digitConvertedName
            .replace(/\b(rs|rupees?)\b\.?\s*([০-৯0-9]+)/gi, '$2 taka') // Swap "Rs. 20" to "20 taka"
            .replace(/\b(rs|rupees?)\b\.?/gi, 'taka') // Fallback for standalone "Rs"
            .replace(/\b(yellow)\b/gi, 'holud')
            .replace(/\b(red)\b/gi, 'lal')
            .replace(/\b(green)\b/gi, 'sobuj')
            .replace(/\b(blue)\b/gi, 'nil')
            .replace(/\b(black)\b/gi, 'kalo')
            .replace(/\b(white)\b/gi, 'sada');

          const res = await fetch(`https://inputtools.google.com/request?text=${encodeURIComponent(processedName)}&itc=bn-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`);
          const data = await res.json();
          if (data && data[1] && data[1][0] && data[1][0][1] && data[1][0][1][0]) {
            // Double check if it hasn't been touched while fetching
            setNameBn((prev) => isNameBnTouched ? prev : data[1][0][1][0]);
          }
        } catch (err) {
          console.error("Auto-translate failed:", err);
        }
      }
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [name, isNameBnTouched]);

  const handleGenerateBarcode = () => {
    setBarcode(generateBarcode());
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError('Product name is required.');
      return;
    }
    if (!isCategoryValid) {
      setFormError('Please select or enter a category.');
      return;
    }
    const bp = parseFloat(buyingPrice);
    const sp = parseFloat(sellingPrice);
    if (isNaN(bp) || bp < 0) {
      setFormError('Buying price must be a valid non-negative number.');
      return;
    }
    if (isNaN(sp) || sp < 0) {
      setFormError('Selling price must be a valid non-negative number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const data: ProductFormData = {
        id: product?.id,
        name: name.trim(),
        nameBn: nameBn || undefined,
        barcode: barcode || undefined,
        category: category === 'new_category_custom_value' ? newCategory.trim() : category,
        buyingPrice: bp,
        sellingPrice: sp,
        unit,
        currentStock: parseFloat(currentStock) || 0,
        minStockLevel: parseFloat(minStockLevel) || 5,
        isActive,
      };

      onSubmit?.(data);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save product';
      setFormError(msg);
      toast({ title: 'Save Failed', description: msg, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCategoryValid = category === 'new_category_custom_value' ? newCategory.trim().length > 0 : !!category;
  const isValid = name && isCategoryValid && buyingPrice && sellingPrice;

  // Calculate profit margin
  const profitMargin = buyingPrice && sellingPrice && parseFloat(buyingPrice) > 0
    ? (((parseFloat(sellingPrice) - parseFloat(buyingPrice)) / parseFloat(buyingPrice)) * 100).toFixed(1)
    : null;

  const showNameError = formError && !name.trim();
  const showCategoryError = formError && !isCategoryValid;
  const showBuyingPriceError = formError && (isNaN(parseFloat(buyingPrice)) || parseFloat(buyingPrice) < 0);
  const showSellingPriceError = formError && (isNaN(parseFloat(sellingPrice)) || parseFloat(sellingPrice) < 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="sm:max-w-[425px] w-[95vw] max-h-[90dvh] overflow-y-auto p-4 md:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            {isEditing ? 'Edit Product' : 'Add New Product'}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update product details' : 'Add a new product to your inventory'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Product Name */}
          <div className="space-y-2">
            <Label htmlFor="product-form-name">Product Name *</Label>
            <Input
              id="product-form-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Tata Salt"
              className={showNameError ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
          </div>

          {/* Bengali Name */}
          <div className="space-y-2">
            <Label htmlFor="product-form-nameBn" className="flex items-center gap-2">
              <Languages className="w-4 h-4" />
              Bengali Name (বাংলা)
            </Label>
            <Input
              id="product-form-nameBn"
              value={nameBn}
              onChange={(e) => {
                setNameBn(e.target.value);
                setIsNameBnTouched(true);
              }}
              placeholder="e.g., টাটা লবণ"
            />
          </div>

          {/* Barcode */}
          <div className="space-y-2">
            <Label htmlFor="product-form-barcode" className="flex items-center gap-2">
              <Barcode className="w-4 h-4" />
              Barcode
            </Label>
            <div className="flex gap-2">
              <Input
                id="product-form-barcode"
                value={barcode}
                onChange={(e) => setBarcode(convertBengaliToEnglishNumerals(e.target.value))}
                placeholder="Scan or enter barcode"
                className="flex-1 font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => isNativeApp ? setIsScannerOpen(true) : setIsWebScannerOpen(true)}
                title="Scan barcode"
                className="md:hidden"
              >
                <ScanLine className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleGenerateBarcode}
                title="Generate barcode"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {/* Web camera scanner (non-native) */}
            {isWebScannerOpen && (
              <div className="relative border rounded-lg overflow-hidden bg-black">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 z-10 bg-black/50 text-white hover:bg-black/70 h-8 w-8"
                  onClick={() => startShutdown()}
                >
                  <X className="w-4 h-4" />
                </Button>
                <div id={scannerId} className="w-full" />
                {!isInitialized && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <p className="text-white text-sm">ক্যামেরা চালু হচ্ছে...</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="product-form-category">Category *</Label>
            <Select 
              value={category} 
              onValueChange={(val) => {
                setCategory(val);
                if (val !== 'new_category_custom_value') {
                  setNewCategory('');
                }
              }}
            >
              <SelectTrigger id="product-form-category" className={showCategoryError ? 'border-destructive focus-visible:ring-destructive' : ''}>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {allCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
                <SelectItem value="new_category_custom_value" className="text-primary font-medium">
                  + Add New Category
                </SelectItem>
              </SelectContent>
            </Select>
            {category === 'new_category_custom_value' && (
              <div className="animate-in fade-in slide-in-from-top-1 pt-2">
                <label htmlFor="product-form-newCategory" className="sr-only">New category name</label>
                <Input
                  id="product-form-newCategory"
                  name="newCategory"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Enter new category name"
                  className={cn("h-9 text-sm", showCategoryError ? 'border-destructive focus-visible:ring-destructive' : '')}
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* Unit */}
          <div className="space-y-2">
            <Label htmlFor="product-form-unit">Unit</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger id="product-form-unit">
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Prices */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="product-form-buyingPrice">Buying Price (₹) *</Label>
              <Input
                id="product-form-buyingPrice"
                type="number"
                value={buyingPrice}
                onChange={(e) => setBuyingPrice(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
                className={showBuyingPriceError ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-form-sellingPrice">Selling Price (₹) *</Label>
              <Input
                id="product-form-sellingPrice"
                type="number"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
                className={showSellingPriceError ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
            </div>
          </div>

          {/* Profit Margin */}
          {profitMargin && (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant={parseFloat(profitMargin) >= 10 ? 'default' : 'secondary'}>
                {profitMargin}% margin
              </Badge>
              <span className="text-muted-foreground">
                Profit: ₹{(parseFloat(sellingPrice) - parseFloat(buyingPrice)).toFixed(2)} per {unit}
              </span>
            </div>
          )}

          <Separator />

          {/* Stock */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="product-form-currentStock">Current Stock</Label>
              <Input
                id="product-form-currentStock"
                type="number"
                value={currentStock}
                onChange={(e) => setCurrentStock(e.target.value)}
                placeholder="0"
                min="0"
                step={['kg', 'liter'].includes(unit) ? '0.1' : '1'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-form-minStockLevel">Min Stock Level</Label>
              <Input
                id="product-form-minStockLevel"
                type="number"
                value={minStockLevel}
                onChange={(e) => setMinStockLevel(e.target.value)}
                placeholder="5"
                min="0"
                step={['kg', 'liter'].includes(unit) ? '0.1' : '1'}
              />
            </div>
          </div>

          {/* Active Status */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="product-form-isActive">Active</Label>
              <p className="text-xs text-muted-foreground">Inactive products won't appear in POS</p>
            </div>
            <Switch
              id="product-form-isActive"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>

          {/* Form error message */}
          {formError && (
            <p className="text-sm text-destructive flex items-center gap-1 pt-1">
              <span aria-hidden="true">⚠️</span>{formError}
            </p>
          )}
        </div>

      {/* Native app barcode scanner */}
      {isNativeApp && (
        <CameraScannerDialog
          open={isScannerOpen}
          onOpenChange={setIsScannerOpen}
          onBarcodeScanned={(scanned) => { setBarcode(scanned); setIsScannerOpen(false); }}
          title="Scan Product Barcode"
          description="Position the barcode in the center of the frame"
          singleScan
        />
      )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}>
            {isSubmitting ? 'Saving...' : isEditing ? 'Update Product' : 'Add Product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ProductDialog;
