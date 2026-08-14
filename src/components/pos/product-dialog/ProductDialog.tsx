'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';
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
import { Package, Barcode, RefreshCw, Languages, ScanLine, X, Loader2 } from 'lucide-react';
import { useProductsStore } from '@/stores/pos-store';
import { cn, convertBengaliToEnglishNumerals } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { CameraScannerDialog } from '../CameraScannerDialog';
import { useCameraBarcodeScanner } from '@/hooks/use-camera-barcode-scanner';
import { Capacitor } from '@capacitor/core';
import { bumpSubcategoryUsage, getSortedSubcategories } from '@/lib/subcategory-usage';
import {
  DEFAULT_CATEGORIES,
  generateBarcode,
  UNITS,
  type ProductDialogProps,
  type ProductFormData,
} from './types';

export type { ProductDialogProps, ProductFormData } from './types';

export function ProductDialog({
  open,
  onOpenChange,
  product,
  onSubmit,
}: ProductDialogProps) {
  const [name, setName] = useState(product?.name || '');
  const [nameBn, setNameBn] = useState(product?.nameBn || '');
  const [barcode, setBarcode] = useState(product?.barcode || '');
  const [category, setCategory] = useState(product?.category || '');
  const [newCategory, setNewCategory] = useState('');
  const [subCategory, setSubCategory] = useState(product?.subCategory || '');
  const [newSubCategory, setNewSubCategory] = useState('');
  const [buyingPrice, setBuyingPrice] = useState(product?.buyingPrice.toString() || '');
  const [sellingPrice, setSellingPrice] = useState(product?.sellingPrice.toString() || '');
  const [unit, setUnit] = useState(product?.unit || 'piece');
  const [currentStock, setCurrentStock] = useState(product?.currentStock.toString() || '0');
  const [minStockLevel, setMinStockLevel] = useState(product?.minStockLevel.toString() || '5');
  const [isActive, setIsActive] = useState(product ? product.isActive : true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isWebScannerOpen, setIsWebScannerOpen] = useState(false);
  const [isNameBnTouched, setIsNameBnTouched] = useState(!!product);
  const [isNameTouched, setIsNameTouched] = useState(!!product);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isSubCategoryOpen, setIsSubCategoryOpen] = useState(false);
  const [isUnitOpen, setIsUnitOpen] = useState(false);
  const isAnySelectOpen = isCategoryOpen || isSubCategoryOpen || isUnitOpen;
  const isAnySelectOpenRef = useRef(isAnySelectOpen);
  useEffect(() => {
    isAnySelectOpenRef.current = isAnySelectOpen;
  }, [isAnySelectOpen]);

  const t = useTranslations('ProductDialog');
  const tc = useTranslations('Common');
  const { formatNumber } = useNumberFormat();
  const noSpinnersClass = "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
  const blockScrollAndArrowKeys = {
    onWheel: (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur(),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
    },
  };

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
  const products = useProductsStore((state) => state.products);
  const allCategories = useMemo(() => [...new Set([...DEFAULT_CATEGORIES, ...categories])].sort(), [categories]);
  const allSubCategories = useMemo(() => {
    const subSet = [...new Set(products.map((p) => p.subCategory).filter(Boolean) as string[])];
    return getSortedSubcategories(category, subSet);
  }, [products, category]);

  const isEditing = !!product;

  // Populate form when editing
  useEffect(() => {
    if (open) {
      if (product) {
        setName(product.name);
        setNameBn(product.nameBn || '');
        setBarcode(product.barcode || '');
        setCategory(product.category);
        setSubCategory(product.subCategory || '');
        setBuyingPrice(product.buyingPrice.toString());
        setSellingPrice(product.sellingPrice.toString());
        setUnit(product.unit);
        setCurrentStock(product.currentStock.toString());
        setMinStockLevel(product.minStockLevel.toString());
        setIsActive(product.isActive);
        setIsNameBnTouched(true);
        setIsNameTouched(true);
      } else {
        // Reset for new product
        setName('');
        setNameBn('');
        setBarcode('');
        setCategory('');
        setNewCategory('');
        setSubCategory('');
        setNewSubCategory('');
        setBuyingPrice('');
        setSellingPrice('');
        setUnit('piece');
        setCurrentStock('0');
        setMinStockLevel('5');
        setIsActive(true);
        setIsNameBnTouched(false);
        setIsNameTouched(false);
      }
    }
  }, [open, product]);


  // Auto-translate Bengali name to English
  const pendingEnglishTranslationRef = useRef<string | null>(null);
  useEffect(() => {
    if (!nameBn.trim()) {
      if (!isNameTouched) setName('');
      return;
    }
    
    const timeoutId = setTimeout(async () => {
      if (!isNameTouched) {
        try {
          let preProcessedName = nameBn.trim();
          
          // Convert Bengali digits to English digits
          const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
          const englishDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
          for (let i = 0; i < bengaliDigits.length; i++) {
            preProcessedName = preProcessedName.split(bengaliDigits[i]).join(englishDigits[i]);
          }

          preProcessedName = preProcessedName
            // Currency: convert "১০ টাকা" to "Rs. 10"
            .replace(/([0-9]+)\s*(?:টাকা|ট|taka|tk)/gi, 'Rs. $1')
            // Units
            .replace(/([0-9]+)\s*(?:মিলি|ml)/gi, '$1 ml')
            .replace(/([0-9]+)\s*(?:গ্রাম|গ্রা|g)/gi, '$1 g')
            .replace(/([0-9]+)\s*(?:লিটার|লি|l)/gi, '$1 L')
            .replace(/([0-9]+)\s*(?:পিস|p|pc|pcs)/gi, '$1 pcs')
            // Colors with word boundaries
            .replace(/(^|\s)হলুদ(?=\s|$)/g, '$1Yellow')
            .replace(/(^|\s)লাল(?=\s|$)/g, '$1Red')
            .replace(/(^|\s)সবুজ(?=\s|$)/g, '$1Green')
            .replace(/(^|\s)নীল(?=\s|$)/g, '$1Blue')
            .replace(/(^|\s)কালো(?=\s|$)/g, '$1Black')
            .replace(/(^|\s)সাদা(?=\s|$)/g, '$1White');

          // Extract English tokens (Rs. X, X ml, X g, etc.) BEFORE translation
          // so Google Translate doesn't mangle them
          const extractedTokens: string[] = [];
          let textToTranslate = preProcessedName.replace(
            /(?:Rs\.\s*[0-9]+|[0-9]+\s*(?:ml|g|kg|L|pcs))/gi,
            (match) => {
              extractedTokens.push(match.trim());
              return `__TOKEN${extractedTokens.length - 1}__`;
            }
          );

          const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=bn&tl=en&dt=t&q=${encodeURIComponent(textToTranslate)}`);
          const data = await res.json();
          if (data && data[0] && data[0][0] && data[0][0][0]) {
            let translated = data[0][0][0] as string;

            // Restore extracted tokens back into the translated string
            for (let i = 0; i < extractedTokens.length; i++) {
              translated = translated.replace(
                new RegExp(`__TOKEN${i}__`, 'gi'),
                extractedTokens[i]
              );
            }
            
            // Post-processing: clean up any leftover currency/unit formatting
            translated = translated
              .replace(/\b(?:rs|rupees?)\b\.?\s*([0-9]+)/gi, 'Rs. $1')
              .replace(/([0-9]+)\s*(?:rs|rupees?)\b\.?/gi, 'Rs. $1')
              .replace(/([0-9]+)\s*ml\b/gi, '$1 ml')
              .replace(/([0-9]+)\s*g\b/gi, '$1 g')
              .replace(/([0-9]+)\s*l\b/gi, '$1 L')
              .replace(/([0-9]+)\s*kg\b/gi, '$1 kg');

            translated = translated.replace(/\b\w/g, (c: string) => c.toUpperCase());
            translated = translated
              .replace(/\bRs\b/g, 'Rs.')
              .replace(/\bRs\.\./g, 'Rs.')
              .replace(/\bMl\b/g, 'ml')
              .replace(/\bKg\b/g, 'kg')
              .replace(/\bG\b/g, 'g')
              .replace(/\bL\b/g, 'L')
              .replace(/\s{2,}/g, ' ').trim();

            if (isAnySelectOpenRef.current) {
              pendingEnglishTranslationRef.current = translated;
            } else {
              setName((prev) => isNameTouched ? prev : translated);
            }
          }
        } catch (err) {
          console.error("Auto-translate Bn->En failed:", err);
        }
      }
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [nameBn, isNameTouched, isAnySelectOpen]);

  // Apply buffered translation once all dropdowns close
  useEffect(() => {
    if (!isAnySelectOpen) {
      if (pendingEnglishTranslationRef.current !== null) {
        const pending = pendingEnglishTranslationRef.current;
        pendingEnglishTranslationRef.current = null;
        setName((prev) => isNameTouched ? prev : pending);
      }
    }
  }, [isAnySelectOpen, isNameTouched]);

  const handleGenerateBarcode = () => {
    setBarcode(generateBarcode());
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!nameBn.trim()) {
      setFormError('বাংলা নাম আবশ্যক');
      return;
    }
    if (!isCategoryValid) {
      setFormError(t('category_required'));
      return;
    }
    const bp = parseFloat(buyingPrice);
    const sp = parseFloat(sellingPrice);
    if (isNaN(bp) || bp < 0) {
      setFormError(t('buying_price_invalid'));
      return;
    }
    if (isNaN(sp) || sp < 0) {
      setFormError(t('selling_price_invalid'));
      return;
    }

    setIsSubmitting(true);
    try {
      const finalCategory = category === 'new_category_custom_value' ? newCategory.trim() : category;
      const finalSubCategory =
        subCategory === '__none__' || subCategory === ''
          ? undefined
          : subCategory === 'new_subcat_custom_value'
          ? newSubCategory.trim() || undefined
          : subCategory.trim() || undefined;

      if (finalCategory && finalSubCategory) {
        bumpSubcategoryUsage(finalCategory, finalSubCategory);
      }

      const data: ProductFormData = {
        id: product?.id,
        name: name.trim() || nameBn.trim(),
        nameBn: nameBn.trim() || undefined,
        barcode: barcode || undefined,
        category: finalCategory,
        subCategory: finalSubCategory,
        buyingPrice: bp,
        sellingPrice: sp,
        unit,
        currentStock: parseFloat(currentStock) || 0,
        minStockLevel: parseFloat(minStockLevel) || 5,
        isActive,
      };

      await onSubmit?.(data);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('failed_save');
      setFormError(msg);
      toast({ title: t('save_failed'), description: msg, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCategoryValid = category === 'new_category_custom_value' ? newCategory.trim().length > 0 : !!category;

  const hasChanges = isEditing ? (
    name !== product?.name ||
    nameBn !== (product?.nameBn || '') ||
    barcode !== (product?.barcode || '') ||
    category !== product?.category ||
    subCategory !== (product?.subCategory || '') ||
    buyingPrice !== product?.buyingPrice.toString() ||
    sellingPrice !== product?.sellingPrice.toString() ||
    unit !== product?.unit ||
    currentStock !== product?.currentStock.toString() ||
    minStockLevel !== product?.minStockLevel.toString() ||
    isActive !== product?.isActive
  ) : true;

  const isValid = nameBn && isCategoryValid && buyingPrice && sellingPrice && hasChanges;

  // Calculate profit margin
  const profitMargin = buyingPrice && sellingPrice && parseFloat(buyingPrice) > 0
    ? (((parseFloat(sellingPrice) - parseFloat(buyingPrice)) / parseFloat(buyingPrice)) * 100).toFixed(1)
    : null;

  const showNameBnError = formError && !nameBn.trim();
  const showCategoryError = formError && !isCategoryValid;
  const showBuyingPriceError = formError && (isNaN(parseFloat(buyingPrice)) || parseFloat(buyingPrice) < 0);
  const showSellingPriceError = formError && (isNaN(parseFloat(sellingPrice)) || parseFloat(sellingPrice) < 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="sm:max-w-106.25 w-[95vw] max-h-[90dvh] overflow-y-auto p-4 md:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              {isEditing ? t('edit_product') : t('add_product')}
            </DialogTitle>
            <DialogDescription>
              {isEditing ? t('edit_desc') : t('add_desc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Bengali Name */}
            <div className="space-y-2">
              <Label htmlFor="product-form-nameBn" className="flex items-center gap-2">
                <Languages className="w-4 h-4" />
                {t('bengali_name')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="product-form-nameBn"
                value={nameBn}
                onChange={(e) => {
                  setNameBn(e.target.value);
                  setIsNameBnTouched(true);
                }}
                placeholder={t('bengali_name_placeholder')}
                className={showNameBnError ? 'border-destructive focus-visible:ring-destructive' : ''}
              />
            </div>

            {/* Product Name */}
            <div className="space-y-2">
              <Label htmlFor="product-form-name">ইংরেজি নাম <span className="text-muted-foreground text-xs font-normal">{t('optional')}</span></Label>
              <Input
                id="product-form-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setIsNameTouched(true);
                }}
                placeholder={t('product_name_placeholder')}
              />
            </div>

            {/* Barcode */}
            <div className="space-y-2">
              <Label htmlFor="product-form-barcode" className="flex items-center gap-2">
                <Barcode className="w-4 h-4" />
                {t('barcode')}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="product-form-barcode"
                  value={barcode}
                  onChange={(e) => setBarcode(convertBengaliToEnglishNumerals(e.target.value.replace(/\s+/g, '')))}
                  placeholder={t('barcode_placeholder')}
                  className="flex-1 font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => isNativeApp ? setIsScannerOpen(true) : setIsWebScannerOpen(true)}
                  title={t('scan_barcode')}
                  className="md:hidden"
                >
                  <ScanLine className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleGenerateBarcode}
                  title={t('generate_barcode')}
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
                    onClick={() => { startShutdown(); setIsWebScannerOpen(false); }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  <div id={scannerId} className="w-full" />
                  {!isInitialized && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                      <p className="text-white text-sm">{t('camera_starting')}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="product-form-category">{t('category')}</Label>
              <Select 
                value={category} 
                onValueChange={(val) => {
                  setCategory(val);
                  if (val !== 'new_category_custom_value') {
                    setNewCategory('');
                  }
                }}
                onOpenChange={setIsCategoryOpen}
              >
                <SelectTrigger id="product-form-category" className={showCategoryError ? 'border-destructive focus-visible:ring-destructive' : ''}>
                  <SelectValue placeholder={t('category_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {allCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                  <SelectItem value="new_category_custom_value" className="text-primary font-medium">
                    {t('add_new_category')}
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
                    placeholder={t('new_category_placeholder')}
                    className={cn("h-9 text-sm", showCategoryError ? 'border-destructive focus-visible:ring-destructive' : '')}
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Subcategory */}
            <div className="space-y-2">
              <Label htmlFor="product-form-subcategory">{t('subcategory')}</Label>
              <Select
                value={subCategory}
                onValueChange={(val) => {
                  setSubCategory(val);
                  if (val !== 'new_subcat_custom_value') {
                    setNewSubCategory('');
                  }
                }}
                onOpenChange={setIsSubCategoryOpen}
              >
                <SelectTrigger id="product-form-subcategory">
                  <SelectValue placeholder={t('subcategory_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('no_subcategory')}</SelectItem>
                  {allSubCategories.map((sc) => (
                    <SelectItem key={sc} value={sc}>{sc}</SelectItem>
                  ))}
                  <SelectItem value="new_subcat_custom_value" className="text-primary font-medium">
                    {t('add_new_subcategory')}
                  </SelectItem>
                </SelectContent>
              </Select>
              {subCategory === 'new_subcat_custom_value' && (
                <div className="animate-in fade-in slide-in-from-top-1 pt-2">
                  <label htmlFor="product-form-newSubCategory" className="sr-only">New subcategory name</label>
                  <Input
                    id="product-form-newSubCategory"
                    value={newSubCategory}
                    onChange={(e) => setNewSubCategory(e.target.value)}
                    placeholder={t('new_subcategory_placeholder')}
                    className="h-9 text-sm"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Unit */}
            <div className="space-y-2">
              <Label htmlFor="product-form-unit">{t('unit')}</Label>
              <Select value={unit} onValueChange={setUnit} onOpenChange={setIsUnitOpen}>
                <SelectTrigger id="product-form-unit">
                  <SelectValue placeholder={t('unit_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>{t(`units.${u.value}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Prices */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product-form-buyingPrice">{t('buying_price')}</Label>
                <Input
                  id="product-form-buyingPrice"
                  type="number"
                  value={buyingPrice}
                  onChange={(e) => setBuyingPrice(convertBengaliToEnglishNumerals(e.target.value))}
                  placeholder="0"
                  min="0"
                  step="0.01"
                  className={cn(noSpinnersClass, showBuyingPriceError ? 'border-destructive focus-visible:ring-destructive' : '')}
                  {...blockScrollAndArrowKeys}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-form-sellingPrice">{t('selling_price')}</Label>
                <Input
                  id="product-form-sellingPrice"
                  type="number"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(convertBengaliToEnglishNumerals(e.target.value))}
                  placeholder="0"
                  min="0"
                  step="0.01"
                  className={cn(noSpinnersClass, showSellingPriceError ? 'border-destructive focus-visible:ring-destructive' : '')}
                  {...blockScrollAndArrowKeys}
                />
              </div>
            </div>

            {/* Profit Margin */}
            {profitMargin && (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant={parseFloat(profitMargin) >= 10 ? 'default' : 'secondary'}>
                  {formatNumber(profitMargin)}{t('margin')}
                </Badge>
                <span className="text-muted-foreground">
                  {t('profit', { amount: formatNumber((parseFloat(sellingPrice) - parseFloat(buyingPrice)).toFixed(2)), unit })}
                </span>
              </div>
            )}

            <Separator />

            {/* Stock */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product-form-currentStock">{t('current_stock')}</Label>
                <Input
                  id="product-form-currentStock"
                  type="number"
                  value={currentStock}
                  onChange={(e) => setCurrentStock(convertBengaliToEnglishNumerals(e.target.value))}
                  placeholder="0"
                  min="0"
                  step={['kg', 'liter'].includes(unit) ? '0.1' : '1'}
                  className={noSpinnersClass}
                  {...blockScrollAndArrowKeys}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-form-minStockLevel">{t('min_stock')}</Label>
                <Input
                  id="product-form-minStockLevel"
                  type="number"
                  value={minStockLevel}
                  onChange={(e) => setMinStockLevel(convertBengaliToEnglishNumerals(e.target.value))}
                  placeholder="5"
                  min="0"
                  step={['kg', 'liter'].includes(unit) ? '0.1' : '1'}
                  className={noSpinnersClass}
                  {...blockScrollAndArrowKeys}
                />
              </div>
            </div>

            {/* Active Status */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="product-form-isActive">{t('active')}</Label>
                <p className="text-xs text-muted-foreground">{t('inactive_note')}</p>
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

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={!isValid || isSubmitting} className="flex items-center gap-2">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('saving')}</span>
                </>
              ) : isEditing ? (
                t('update_product')
              ) : (
                t('add_product_btn')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Native app barcode scanner */}
      {isNativeApp && (
        <CameraScannerDialog
          open={isScannerOpen}
          onOpenChange={setIsScannerOpen}
          onBarcodeScanned={(scanned) => { setBarcode(scanned); setIsScannerOpen(false); }}
          title={t('scan_product_barcode')}
          description={t('position_barcode')}
          singleScan
        />
      )}
    </>
  );
}

export default ProductDialog;
