'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Package, AlertTriangle, Plus } from 'lucide-react';
import type { Product } from '@/types/pos';
import { useCartStore } from '@/stores/pos-store';
import { cn } from '@/lib/utils';
import { useTranslations, useLocale } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const t = useTranslations('Billing');
  const locale = useLocale();
  const { formatPrice } = useNumberFormat();
  
  const isLowStock = product.currentStock <= product.minStockLevel;
  const isOutOfStock = product.currentStock <= 0;

  const isBn = locale === 'bn';
  const displayName = isBn ? (product.nameBn || product.name) : (product.name || product.nameBn);

  const handleAddToCart = () => {
    addItem(product, 1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleAddToCart();
    }
  };

  return (
    <TooltipProvider>
      <Card
        className={cn(
          'group relative overflow-hidden transition-all duration-300 cursor-pointer rounded-lg sm:rounded-xl border-border/50',
          'lg:hover:shadow-xl lg:hover:-translate-y-1 active:scale-[0.98]',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isOutOfStock && 'border-red-200/50 dark:border-red-900/30'
        )}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={handleAddToCart}
        role="button"
        aria-label={`${t('add_to_cart')} ${displayName}, ${formatPrice(product.sellingPrice)} / ${product.unit}`}
      >
        {/* Low Stock Warning Banner */}
        {isLowStock && !isOutOfStock && (
          <div className="absolute top-0 left-0 right-0 bg-amber-500/90 backdrop-blur-sm text-white text-[9px] sm:text-[10px] font-semibold tracking-wider uppercase py-0.5 sm:py-1 px-1.5 text-center z-10 shadow-sm flex items-center justify-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            {t('low_stock')}
          </div>
        )}

        <CardContent className={cn('p-2 sm:p-3', isLowStock && !isOutOfStock && 'pt-5 sm:pt-7')}>
          <div className="flex flex-col gap-1.5 sm:gap-2">
            {/* Product Image or Placeholder */}
            <div className="aspect-square rounded-md sm:rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden relative lg:group-hover:bg-muted transition-colors">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <Package className="w-7 h-7 sm:w-10 sm:h-10 text-muted-foreground" />
              )}
            </div>

            {/* Product Info */}
            <div className="space-y-1 sm:space-y-1.5 pt-0.5">
              <div className="flex items-start justify-between gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <h3 className="font-medium text-xs sm:text-sm line-clamp-2 leading-tight lg:group-hover:text-primary transition-colors">
                      {displayName}
                    </h3>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-50">
                    <p className="font-medium">{product.name}</p>
                    {product.nameBn && <p className="text-muted-foreground text-xs mt-1">{product.nameBn}</p>}
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Category Badge */}
              <Badge variant="secondary" className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0 h-3.5 sm:h-4 bg-secondary/50 lg:hover:bg-secondary max-w-full truncate">
                {product.category}
              </Badge>

              {/* Price & Stock */}
              <div className="flex flex-col mt-0.5 sm:mt-2">
                <p className="text-sm sm:text-lg font-bold text-primary tracking-tight tabular-nums">
                  {formatPrice(product.sellingPrice)}
                  <span className="text-[10px] sm:text-xs font-normal text-muted-foreground ml-0.5 tracking-normal">
                    /{product.unit}
                  </span>
                </p>
                <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                  <span className={cn(
                    "font-medium truncate",
                    isOutOfStock ? "text-red-500 font-bold" : isLowStock ? "text-amber-600 dark:text-amber-500" : ""
                  )}>
                    {t('stock')}: {product.currentStock}{isOutOfStock ? ` (${t('out_of_stock')})` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Add Button */}
            <Button
              size="sm"
              className={cn(
                "w-full mt-1 sm:mt-2 h-8 sm:h-9 text-xs sm:text-sm transition-all duration-300 touch-manipulation shadow-xs",
                "lg:opacity-0 lg:-translate-y-2 lg:group-hover:opacity-100 lg:group-hover:translate-y-0",
                "opacity-100 translate-y-0 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
              )}
              onClick={(e) => {
                e.stopPropagation();
                handleAddToCart();
              }}
              aria-label={t('add_to_cart')}
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-0.5" />
              {t('add_to_cart')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

export default ProductCard;
