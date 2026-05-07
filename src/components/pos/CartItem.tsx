import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Minus, Plus, Trash2, GripVertical } from 'lucide-react';
import type { CartItem as CartItemType } from '@/types/pos';
import { useCartStore } from '@/stores/pos-store';
import { cn } from '@/lib/utils';
import Decimal from 'decimal.js';

interface CartItemProps {
  item: CartItemType;
  isHighlighted?: boolean;
}

export function CartItem({ item, isHighlighted = false }: CartItemProps) {
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const itemRef = useRef<HTMLDivElement>(null);

  // Scroll into view and highlight when newly added
  useEffect(() => {
    if (isHighlighted && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isHighlighted]);


  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const getStep = (unit: string) => {
    if (['kg', 'liter'].includes(unit)) return 0.1;
    if (['gram', 'ml'].includes(unit)) return 50;
    return 1;
  };

  const handleQuantityChange = useCallback(
    (newQuantity: number) => {
      // Ensure we don't go below 0 and not above availableStock
      const validatedQuantity = Math.max(0, Math.min(newQuantity, item.availableStock));
      if (validatedQuantity === 0) {
        // If quantity becomes 0, remove the item
        removeItem(item.id);
      } else {
        updateQuantity(item.id, validatedQuantity);
      }
    },
    [item.id, item.availableStock, updateQuantity, removeItem]
  );

  const handleIncrement = useCallback(() => {
    const step = getStep(item.unit);
    const newQty = new Decimal(item.quantity).plus(new Decimal(step)).toNumber();
    const validatedQuantity = Math.min(newQty, item.availableStock);
    updateQuantity(item.id, validatedQuantity);
  }, [item.id, item.quantity, item.unit, item.availableStock, updateQuantity]);

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

  const [inputValue, setInputValue] = useState<string>(String(item.quantity));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setInputValue(String(item.quantity));
    }
  }, [item.quantity]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const commitInputValue = () => {
    const value = parseFloat(inputValue);
    if (!isNaN(value) && value > 0) {
      handleQuantityChange(value);
    } else {
      setInputValue(String(item.quantity));
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

  const isOverStock = item.quantity > item.availableStock;
  const isAtStockLimit = item.quantity >= item.availableStock;

  const isWeighted = ['kg', 'liter', 'gram', 'ml'].includes(item.unit);
  const AMOUNT_PRESETS = [10, 20, 50, 100];
  const PIECE_PRESETS = [5, 10, 20, 50];

  const handlePiecePreset = useCallback((qty: number) => {
    const validated = Math.min(qty, item.availableStock);
    updateQuantity(item.id, validated);
  }, [item.id, item.availableStock, updateQuantity]);

  const handleAmountPreset = useCallback((taka: number) => {
    if (!item.unitPrice || item.unitPrice === 0) return;
    const newQty = new Decimal(taka).div(new Decimal(item.unitPrice)).toDecimalPlaces(3).toNumber();
    const validated = Math.min(newQty, item.availableStock);
    updateQuantity(item.id, validated);
  }, [item.id, item.unitPrice, item.availableStock, updateQuantity]);

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
      aria-label={`${item.productName}, quantity ${item.quantity}, ${formatPrice(item.totalPrice)}`}
    >
      {/* Drag Handle (for future reordering) */}
      <div className="text-muted-foreground transition-opacity">
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-medium text-xs truncate">{item.productName}</h4>
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
              type="number"
              inputMode="decimal"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              onBlur={commitInputValue}
              className="w-10 h-7 text-center px-1 touch-manipulation text-xs"
              aria-label="Quantity"
              onWheel={(e) => e.currentTarget.blur()}
              max={item.availableStock}
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

          {/* Amount Presets for weighted items */}
          {isWeighted && !isOverStock && (
            <div className="flex items-center gap-0.5">
              {AMOUNT_PRESETS.map((taka) => (
                <button
                  key={taka}
                  onClick={() => handleAmountPreset(taka)}
                  className="h-6 px-1.5 rounded text-[10px] font-medium bg-primary/10 hover:bg-primary/20 text-primary transition-colors touch-manipulation"
                >
                  ₹{taka}
                </button>
              ))}
            </div>
          )}
          {/* Piece Presets */}
          {!isWeighted && !isOverStock && (
            <div className="flex items-center gap-0.5">
              {PIECE_PRESETS.map((qty) => (
                <button
                  key={qty}
                  onClick={() => handlePiecePreset(qty)}
                  className="h-6 px-1.5 rounded text-[10px] font-medium bg-primary/10 hover:bg-primary/20 text-primary transition-colors touch-manipulation"
                >
                  {qty}
                </button>
              ))}
            </div>
          )}

          {/* Stock Warning */}
          {isOverStock && (
            <Badge variant="destructive" className="text-xs">
              Only {item.availableStock} in stock
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
    </div>
  );
}


export default CartItem;
