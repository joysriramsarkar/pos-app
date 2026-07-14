import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Minus, Plus, Trash2, GripVertical } from 'lucide-react';
import type { CartItem as CartItemType } from '@/types/pos';
import { useCartStore, useQuantityUsageStore, useProductsStore } from '@/stores/pos-store';
import { cn, convertBengaliToEnglishNumerals } from '@/lib/utils';
import Decimal from 'decimal.js';
import { useNumberFormat } from '@/hooks/use-number-format';
import { useTranslations, useLocale } from 'next-intl';
import { useSettingsStore } from '@/stores/settings-store';

const EMPTY_USAGE: Record<number, number> = {};

const formatQtyForInput = (qty: number): string => {
  if (Number.isInteger(qty)) return String(qty);
  return String(parseFloat(qty.toFixed(3)));
};

interface CartItemProps {
  item: CartItemType;
  isHighlighted?: boolean;
}

export function CartItem({ item, isHighlighted = false }: CartItemProps) {
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const itemRef = useRef<HTMLDivElement>(null);
  const { formatPrice, formatStringNumbers } = useNumberFormat();
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol);
  const t = useTranslations('Cart');
  const locale = useLocale();

  // Scroll into view and highlight when newly added
  useEffect(() => {
    if (isHighlighted && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isHighlighted]);

  const getStep = (unit: string) => {
    return 1;
  };

  const handleQuantityChange = useCallback(
    (newQuantity: number) => {
      // Ensure we don't go below 0
      const validatedQuantity = Math.max(0, newQuantity);
      if (validatedQuantity === 0) {
        // If quantity becomes 0, remove the item
        removeItem(item.id);
      } else {
        updateQuantity(item.id, validatedQuantity);
      }
    },
    [item.id, updateQuantity, removeItem]
  );

  const handleIncrement = useCallback(() => {
    const step = getStep(item.unit);
    const newQty = new Decimal(item.quantity).plus(new Decimal(step)).toNumber();
    updateQuantity(item.id, newQty);
  }, [item.id, item.quantity, item.unit, updateQuantity]);

  const handleDecrement = useCallback(() => {
    const step = getStep(item.unit);
    const newQty = new Decimal(item.quantity).minus(new Decimal(step)).toNumber();
    if (newQty > 0) {
      updateQuantity(item.id, newQty);
    } else {
      removeItem(item.id);
    }
  }, [item.id, item.quantity, item.unit, updateQuantity, removeItem]);

  const handleRemove = useCallback(() => {
    removeItem(item.id);
  }, [item.id, removeItem]);

  const [inputValue, setInputValue] = useState<string>(() => formatQtyForInput(item.quantity));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setInputValue(formatQtyForInput(item.quantity));
    }
  }, [item.quantity]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow Bengali and English digits, decimal point
    setInputValue(e.target.value);
  };

  const commitInputValue = () => {
    const converted = convertBengaliToEnglishNumerals(inputValue);
    const value = parseFloat(converted);
    if (!isNaN(value) && value > 0) {
      const currentFormatted = parseFloat(item.quantity.toFixed(3));
      if (value === currentFormatted) {
        setInputValue(formatQtyForInput(item.quantity));
        return;
      }
      handleQuantityChange(value);
    } else {
      setInputValue(formatQtyForInput(item.quantity));
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitInputValue();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleIncrement();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleDecrement();
    }
  };

  const storeProduct = useProductsStore((state) =>
    state.products.find((p) => p.id === item.productId)
  );
  const availableStock = storeProduct ? Number(storeProduct.currentStock) : item.availableStock;

  const isOverStock = item.quantity > availableStock;
  const isAtStockLimit = item.quantity >= availableStock;

  const isWeighted = ['kg', 'liter', 'gram', 'ml'].includes(item.unit);
  const productUsage = useQuantityUsageStore((state) => state.usage[item.productId] ?? EMPTY_USAGE);
  const popularQuantities = useMemo(() => {
    return Object.entries(productUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([qty]) => parseFloat(qty))
      .filter((qty) => !isNaN(qty) && qty > 0);
  }, [productUsage]);

  const QUANTITY_PRESETS = useMemo(() => {
    const defaultPresets = isWeighted ? [0.5, 1, 2, 5] : [1, 5, 10, 20];
    const combined = [...popularQuantities];
    for (const preset of defaultPresets) {
      if (combined.length >= 4) break;
      if (!combined.includes(preset)) {
        combined.push(preset);
      }
    }
    return combined.sort((a, b) => a - b);
  }, [popularQuantities, isWeighted]);

  const handlePiecePreset = useCallback((qty: number) => {
    updateQuantity(item.id, qty);
  }, [item.id, updateQuantity]);

  const pricePresets = useMemo(() => {
    if (!isWeighted) return [];
    const defaultPrices = [10, 20, 25, 50];
    const calculatedPrices = popularQuantities.map((qty) => Math.round(qty * item.unitPrice)).filter(p => p > 0);
    const combined = Array.from(new Set(calculatedPrices));
    for (const preset of defaultPrices) {
      if (combined.length >= 4) break;
      if (!combined.includes(preset)) {
        combined.push(preset);
      }
    }
    return combined.sort((a, b) => a - b);
  }, [isWeighted, popularQuantities, item.unitPrice]);

  const handlePricePreset = useCallback((price: number) => {
    const qty = parseFloat((price / item.unitPrice).toFixed(5));
    updateQuantity(item.id, qty);
  }, [item.id, item.unitPrice, updateQuantity]);

  const isBn = locale === 'bn';
  const displayName = storeProduct
    ? (isBn ? (storeProduct.nameBn || storeProduct.name) : (storeProduct.name || storeProduct.nameBn))
    : item.productName;

  return (
    <div
      ref={itemRef}
      className={cn(
        'group flex items-center gap-1.5 p-1 md:p-2 rounded-lg border bg-card transition-all',
        'hover:shadow-sm',
        isHighlighted && 'ring-2 ring-primary ring-offset-2',
        isOverStock && 'border-destructive bg-destructive/5'
      )}
      role="listitem"
      aria-label={`${displayName}, quantity ${item.quantity}, ${formatPrice(item.totalPrice)}`}
    >
      {/* Drag Handle (for future reordering) */}
      <div className="text-muted-foreground transition-opacity">
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-medium text-xs truncate">{displayName}</h4>
            <div className="flex items-center gap-1 mt-0">
              <span className="text-[10px] text-muted-foreground">
                {formatPrice(item.unitPrice)}/{item.unit}
              </span>
              {item.barcode && (
                <Badge variant="outline" className="text-xs px-1 py-0 h-4">
                  {item.barcode}
                </Badge>
              )}
            </div>
          </div>
          {/* Total Price */}
          <div className="text-right shrink-0">
            <p className="font-semibold text-xs md:text-sm">{formatPrice(item.totalPrice)}</p>
          </div>
        </div>

        {/* Quantity Controls */}
        <div className="flex items-center justify-between mt-0.5">
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label="Quantity controls"
            tabIndex={0}
          >
            {/* Decrement Button */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0 touch-manipulation"
              onClick={handleDecrement}
              disabled={item.quantity <= 1 && item.unit === 'piece'}
              aria-label="Decrease quantity"
            >
              <Minus className="w-3 h-3" />
            </Button>

            {/* Quantity Input */}
            <Input
              ref={inputRef}
              id={`quantity-${item.id}`}
              name={`quantity-${item.id}`}
              type="text"
              inputMode="decimal"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              onBlur={commitInputValue}
              className="w-14 h-7 text-center px-1 touch-manipulation text-xs"
              aria-label="Quantity"
              onWheel={(e) => e.currentTarget.blur()}
              min={0}
            />

            {/* Increment Button */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0 touch-manipulation"
              onClick={handleIncrement}
              aria-label="Increase quantity"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {/* Stock Warning */}
            {isOverStock && (
              <Badge variant="destructive" className="text-xs">
                {t('only_stock', { stock: availableStock })}
              </Badge>
            )}

            {/* Remove Button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive touch-manipulation"
              onClick={handleRemove}
              aria-label="Remove item"
            >
              <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
            </Button>
          </div>
        </div>

        {/* Quantity/Price Presets Row */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pt-1.5 border-t border-dashed border-border/40">
          <span className="text-[9px] font-medium text-muted-foreground mr-0.5">
            {isWeighted ? t('preset_price', { defaultValue: 'Preset Price:' }) : t('preset_quantity', { defaultValue: 'Preset Qty:' })}
          </span>
          {isWeighted ? (
            <>
              {pricePresets.map((price) => (
                <button
                  key={price}
                  onClick={() => handlePricePreset(price)}
                  className="h-6 px-1.5 rounded text-[10px] font-medium bg-primary/10 hover:bg-primary/20 text-primary transition-colors touch-manipulation"
                >
                  {currencySymbol}{formatStringNumbers(price)}
                </button>
              ))}
              <Input
                type="number"
                placeholder={t('custom_price', { defaultValue: 'Custom Price' })}
                className="h-6 w-20 text-[10px] px-1.5 py-0 bg-primary/5 border-primary/20 text-primary focus-visible:ring-1 focus-visible:ring-primary/30"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = parseFloat(convertBengaliToEnglishNumerals(e.currentTarget.value));
                    if (!isNaN(val) && val > 0) {
                      handlePricePreset(val);
                      e.currentTarget.blur();
                    }
                  }
                }}
                onBlur={(e) => {
                  const val = parseFloat(convertBengaliToEnglishNumerals(e.currentTarget.value));
                  if (!isNaN(val) && val > 0) {
                    handlePricePreset(val);
                    e.currentTarget.value = '';
                  }
                }}
              />
            </>
          ) : (
            QUANTITY_PRESETS.map((qty) => (
              <button
                key={qty}
                onClick={() => handlePiecePreset(qty)}
                className="h-6 px-1.5 rounded text-[10px] font-medium bg-primary/10 hover:bg-primary/20 text-primary transition-colors touch-manipulation"
              >
                {formatStringNumbers(qty)}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}


export default CartItem;
