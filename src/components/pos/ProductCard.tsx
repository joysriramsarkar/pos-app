'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Package, AlertTriangle, Plus } from 'lucide-react';
import type { Product } from '@/types/pos';
import { useCartStore } from '@/stores/pos-store';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useNumberFormat } from '@/hooks/use-number-format';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const t = useTranslations('Billing');
  const { formatPrice } = useNumberFormat();
  
  const isLowStock = product.currentStock <= product.minStockLevel;
  const isOutOfStock = product.currentStock <= 0;

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
          'group relative overflow-hidden transition-all duration-300 cursor-pointer rounded-xl border-border/50',
          'lg:hover:shadow-xl lg:hover:-translate-y-1 active:scale-[0.98]',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isOutOfStock && 'border-red-200/50 dark:border-red-900/30'
        )}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={handleAddToCart}
        role="button"
        aria-label={`${t('add_to_cart')} ${product.name}, ${formatPrice(product.sellingPrice)} / ${product.unit}`}
      >
        {/* Low Stock Warning Banner */}
        {isLowStock && !isOutOfStock && (
          <div className="absolute top-0 left-0 right-0 bg-amber-500/90 backdrop-blur-sm text-white text-[10px] font-semibold tracking-wider uppercase py-1 px-2 text-center z-10 shadow-sm flex items-center justify-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {t('low_stock')}
          </div>
        )}

        <CardContent className={cn('p-3', isLowStock && !isOutOfStock && 'pt-7')}>
          <div className="flex flex-col gap-2">
            {/* Product Image or Placeholder */}
            <div className="aspect-square rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden relative lg:group-hover:bg-muted transition-colors">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="w-10 h-10 text-muted-foreground" />
              )}
            </div>

            {/* Product Info */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-start justify-between gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <h3 className="font-medium text-sm line-clamp-2 leading-tight lg:group-hover:text-primary transition-colors">
                      {product.name}
                    </h3>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-50">
                    <p className="font-medium">{product.name}</p>
                    {product.nameBn && <p className="text-muted-foreground text-xs mt-1">{product.nameBn}</p>}
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Category Badge */}
              <Badge variant="secondary" className="text-[10px] px-2 py-0 h-4 bg-secondary/50 lg:hover:bg-secondary">
                {product.category}
              </Badge>

              {/* Price & Stock */}
              <div className="flex flex-col mt-2">
                <p className="text-lg font-bold text-primary tracking-tight">
                  {formatPrice(product.sellingPrice)}
                  <span className="text-xs font-normal text-muted-foreground ml-1 tracking-normal">
                    /{product.unit}
                  </span>
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5">
                  <span className={cn(
                    "font-medium",
                    isOutOfStock ? "text-red-500 font-bold" : isLowStock ? "text-amber-600 dark:text-amber-500" : ""
                  )}>
                    {t('stock')}: {product.currentStock} {product.unit} {isOutOfStock && `(${t('out_of_stock')})`}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Add Button */}
            <Button
              size="sm"
              className={cn(
                "w-full mt-2 transition-all duration-300 touch-manipulation shadow-xs",
                "lg:opacity-0 lg:-translate-y-2 lg:group-hover:opacity-100 lg:group-hover:translate-y-0",
                "opacity-100 translate-y-0 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
              )}
              onClick={(e) => {
                e.stopPropagation();
                handleAddToCart();
              }}
              aria-label={t('add_to_cart')}
            >
              <Plus className="w-4 h-4 mr-1" />
              {t('add_to_cart')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

export default ProductCard;
