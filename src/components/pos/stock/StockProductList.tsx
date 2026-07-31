'use client';

import React, { useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Virtuoso, TableVirtuoso } from 'react-virtuoso';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Package,
  Plus,
  Edit,
  Trash2,
  ArrowUpDown,
  MinusCircle,
  Loader2,
} from 'lucide-react';
import type { Product } from '@/types/pos';
import { cn } from '@/lib/utils';
import {
  getStockStatus,
  getStockBorderClass,
  getStockLevelPercent,
  getStockLevelColor,
} from './stock-utils';
import type { SortField } from './types';

export interface StockProductListProps {
  products: Product[];
  isSearching: boolean;
  selectedIds: Set<string>;
  canDelete: boolean;
  sortField: SortField;
  onSort: (field: SortField) => void;
  onToggleSelectAll: () => void;
  onToggleSelectOne: (id: string) => void;
  isAllSelected: boolean;
  isSomeSelected: boolean;
  onAddStock?: (product: Product) => void;
  onEditProduct?: (product: Product) => void;
  onDeleteProduct?: (product: Product) => void;
  onAdjustStock: (product: Product) => void;
  formatPrice: (n: number) => string;
  formatNumber: (n: number | string) => string;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  isLoadingMore: boolean;
}

interface MobileProductCardProps {
  index?: number;
  product: Product;
  isSelected: boolean;
  canDelete: boolean;
  t: any;
  tc: any;
  locale: string;
  onToggleSelectOne: (id: string) => void;
  onAddStock?: (product: Product) => void;
  onAdjustStock: (product: Product) => void;
  onEditProduct?: (product: Product) => void;
  onDeleteProduct?: (product: Product) => void;
  formatPrice: (n: number) => string;
  formatNumber: (n: number | string) => string;
}

const MobileProductCard = React.memo(function MobileProductCard({
  index,
  product,
  isSelected,
  canDelete,
  t,
  tc,
  locale,
  onToggleSelectOne,
  onAddStock,
  onAdjustStock,
  onEditProduct,
  onDeleteProduct,
  formatPrice,
  formatNumber,
}: MobileProductCardProps) {
  const status = getStockStatus(product, t);

  return (
    <div
      data-index={index}
      className={cn(
        'px-2 py-2 hover:bg-muted/50 transition-colors border-l-4 flex gap-2 border-b',
        getStockBorderClass(product),
        isSelected && 'bg-emerald-500/5 dark:bg-emerald-500/10'
      )}
    >
      <div className="pt-0.5 shrink-0">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelectOne(product.id)}
          aria-label={product.name}
          className="h-4 w-4"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-1.5">
          <div className="min-w-0">
            <span className="font-semibold text-xs truncate block leading-tight">
              {locale === 'bn' ? (product.nameBn || product.name) : (product.name || product.nameBn)}
            </span>
            <div className="flex items-center gap-1 mt-0.5 min-w-0">
              {product.barcode && (
                <span className="text-[9px] font-mono text-muted-foreground truncate">
                  {formatNumber(product.barcode)}
                </span>
              )}
              <Badge variant="outline" className="text-[8px] px-1 h-3.5 shrink-0">
                {product.category}
              </Badge>
            </div>
          </div>
          <div className="flex flex-col items-end shrink-0 gap-0.5">
            <Badge variant={status.variant} className="text-[9px] h-4 px-1">
              {status.label}
            </Badge>
            <span
              className={cn(
                'text-xs font-bold tabular-nums leading-none',
                product.currentStock < 0 && 'text-red-600',
                product.currentStock === 0 && 'text-red-600',
                product.currentStock > 0 &&
                  product.currentStock <= product.minStockLevel &&
                  'text-amber-600'
              )}
            >
              {formatNumber(product.currentStock)} {product.unit}
            </span>
          </div>
        </div>

        <div className="my-1">
          <Progress
            value={getStockLevelPercent(product)}
            className={cn('h-1', getStockLevelColor(product))}
          />
        </div>

        <div className="flex justify-between items-center">
          <div className="flex gap-2 text-[10px] text-muted-foreground tabular-nums">
            <span>
              {t('buy')}: <span className="font-medium text-foreground">{formatPrice(product.buyingPrice)}</span>
            </span>
            <span>
              {t('sell')}: <span className="font-medium text-foreground">{formatPrice(product.sellingPrice)}</span>
            </span>
          </div>
          <div className="flex items-center">
            {product.isActive && (
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7 touch-manipulation" onClick={() => onAddStock?.(product)} aria-label="Add stock">
                  <Plus className="w-3.5 h-3.5 text-green-600" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 touch-manipulation" onClick={() => onAdjustStock(product)} aria-label="Adjust stock">
                  <MinusCircle className="w-3.5 h-3.5 text-amber-600" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 touch-manipulation" onClick={() => onEditProduct?.(product)} aria-label="Edit product">
              <Edit className="w-3.5 h-3.5" />
            </Button>
            {canDelete && product.isActive && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive touch-manipulation"
                onClick={() => onDeleteProduct?.(product)}
                aria-label="Delete product"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

interface DesktopProductRowProps {
  index?: number;
  product: Product;
  isSelected: boolean;
  canDelete: boolean;
  t: any;
  tc: any;
  locale: string;
  onToggleSelectOne: (id: string) => void;
  onAddStock?: (product: Product) => void;
  onAdjustStock: (product: Product) => void;
  onEditProduct?: (product: Product) => void;
  onDeleteProduct?: (product: Product) => void;
  formatPrice: (n: number) => string;
  formatNumber: (n: number | string) => string;
}

const DesktopProductRow = React.memo(function DesktopProductRow({
  index,
  product,
  isSelected,
  canDelete,
  t,
  tc,
  locale,
  onToggleSelectOne,
  onAddStock,
  onAdjustStock,
  onEditProduct,
  onDeleteProduct,
  formatPrice,
  formatNumber,
}: DesktopProductRowProps) {
  const status = getStockStatus(product, t);
  const profitMargin =
    product.sellingPrice > 0
      ? ((product.sellingPrice - product.buyingPrice) / product.sellingPrice) * 100
      : 0;

  return (
    <TableRow
      data-index={index}
      className={cn(
        'group border-l-4 transition-colors',
        getStockBorderClass(product),
        isSelected && 'bg-emerald-500/5 dark:bg-emerald-500/10'
      )}
    >
      <TableCell>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelectOne(product.id)}
          aria-label={product.name}
        />
      </TableCell>
      <TableCell>
        <div>
          <p className="font-medium">
            {locale === 'bn' ? (product.nameBn || product.name) : (product.name || product.nameBn)}
          </p>
          {((locale === 'bn' && product.nameBn && product.nameBn !== product.name) ||
            (locale !== 'bn' && product.name && product.name !== product.nameBn)) && (
            <p className="text-xs text-muted-foreground">
              {locale === 'bn' ? product.name : product.nameBn}
            </p>
          )}
          {product.barcode && (
            <p className="text-xs text-muted-foreground font-mono">{formatNumber(product.barcode)}</p>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1 items-start">
          <Badge variant="outline" className="text-xs">
            {product.category}
          </Badge>
          {product.subCategory && (
            <Badge variant="secondary" className="text-[10px] font-normal px-1 py-0">
              {product.subCategory}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">{formatPrice(product.buyingPrice)}</TableCell>
      <TableCell className="text-right font-medium">{formatPrice(product.sellingPrice)}</TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">
        <span className={cn(profitMargin >= 0 ? 'text-green-600' : 'text-red-600')}>
          {formatNumber(Number(profitMargin.toFixed(1)))}%
        </span>
      </TableCell>
      <TableCell className="text-center">
        <div className="space-y-1">
          <div className="flex items-center justify-center gap-1 text-sm">
            <span
              className={cn(
                'font-medium',
                product.currentStock < 0 && 'text-red-600 font-bold',
                product.currentStock === 0 && 'text-red-600',
                product.currentStock > 0 &&
                  product.currentStock <= product.minStockLevel &&
                  'text-amber-600'
              )}
            >
              {formatNumber(product.currentStock)} {product.unit}
            </span>
            <span className="text-xs text-muted-foreground">/ {formatNumber(product.minStockLevel)}</span>
          </div>
          <Progress
            value={getStockLevelPercent(product)}
            className={cn('h-1.5', getStockLevelColor(product))}
          />
        </div>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant={status.variant} className="text-xs">
          {status.label}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
          {product.isActive && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => onAddStock?.(product)}
                title={t('add_stock')}
              >
                <Plus className="w-4 h-4 mr-1 text-green-600" />
                {t('buy')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                onClick={() => onAdjustStock(product)}
                title={t('adjust_stock')}
              >
                <MinusCircle className="w-4 h-4" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => onEditProduct?.(product)}
            title={t('edit')}
          >
            <Edit className="w-4 h-4" />
          </Button>
          {canDelete && product.isActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => onDeleteProduct?.(product)}
              title={t('delete')}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
});

export function StockProductList({
  products,
  isSearching,
  selectedIds,
  canDelete,
  sortField,
  onSort,
  onToggleSelectAll,
  onToggleSelectOne,
  isAllSelected,
  isSomeSelected,
  onAddStock,
  onEditProduct,
  onDeleteProduct,
  onAdjustStock,
  formatPrice,
  formatNumber,
  sentinelRef,
  isLoadingMore,
}: StockProductListProps) {
  const t = useTranslations('Stock');
  const tc = useTranslations('Common');
  const locale = useLocale();

  return (
    <div className="flex-1 min-h-0 relative bg-background rounded-md border overflow-hidden">
      {isSearching && products.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">{tc('loading')}</span>
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mb-2 opacity-50" />
          <p>{t('no_items')}</p>
        </div>
      ) : (
        <>
          {/* Mobile Card View (Virtualized) */}
          <div className="md:hidden h-full">
            <Virtuoso
              style={{ height: '100%' }}
              data={products}
              components={{
                Footer: () => (
                  <div ref={sentinelRef} className="py-4 text-center text-xs text-muted-foreground">
                    {isLoadingMore && t('loading_more')}
                  </div>
                ),
              }}
              itemContent={(index, product) => (
                <MobileProductCard
                  key={product.id}
                  index={index}
                  product={product}
                  isSelected={selectedIds.has(product.id)}
                  canDelete={canDelete}
                  t={t}
                  tc={tc}
                  locale={locale}
                  onToggleSelectOne={onToggleSelectOne}
                  onAddStock={onAddStock}
                  onAdjustStock={onAdjustStock}
                  onEditProduct={onEditProduct}
                  onDeleteProduct={onDeleteProduct}
                  formatPrice={formatPrice}
                  formatNumber={formatNumber}
                />
              )}
            />
          </div>

          {/* Desktop Table View (Virtualized) */}
          <div className="hidden md:block h-full">
            <TableVirtuoso
              style={{ height: '100%' }}
              data={products}
              components={{
                Table: (props) => <Table {...props} className="w-full" />,
                TableHead: TableHeader,
                TableBody: TableBody,
                TableRow: ({ children }: any) => <>{children}</>,
              }}
              fixedFooterContent={() => (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-4 text-xs text-muted-foreground">
                    <div ref={sentinelRef}>
                      {isLoadingMore && t('loading_more')}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              fixedHeaderContent={() => (
                <TableRow className="bg-background hover:bg-background border-b">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                      onCheckedChange={onToggleSelectAll}
                      aria-label={t('select_all')}
                    />
                  </TableHead>
                  <TableHead className="w-[30%]">
                    <Button variant="ghost" size="sm" className="h-8 -ml-3" onClick={() => onSort('name')}>
                      {t('item_name')}
                      <ArrowUpDown className={cn('w-4 h-4 ml-2', sortField === 'name' && 'text-primary')} />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="h-8 -ml-3" onClick={() => onSort('category')}>
                      {tc('category')}
                      <ArrowUpDown className={cn('w-4 h-4 ml-2', sortField === 'category' && 'text-primary')} />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">{t('buy_price')}</TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" size="sm" className="h-8 -ml-3" onClick={() => onSort('price')}>
                      {t('sell_price')}
                      <ArrowUpDown className={cn('w-4 h-4 ml-2', sortField === 'price' && 'text-primary')} />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">{t('profit_margin')}</TableHead>
                  <TableHead className="text-center w-[160px]">
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => onSort('stock')}>
                      {t('stock_level')}
                      <ArrowUpDown className={cn('w-4 h-4 ml-2', sortField === 'stock' && 'text-primary')} />
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">{tc('status')}</TableHead>
                  <TableHead className="text-right">{tc('actions')}</TableHead>
                </TableRow>
              )}
              itemContent={(index, product) => (
                <DesktopProductRow
                  key={product.id}
                  index={index}
                  product={product}
                  isSelected={selectedIds.has(product.id)}
                  canDelete={canDelete}
                  t={t}
                  tc={tc}
                  locale={locale}
                  onToggleSelectOne={onToggleSelectOne}
                  onAddStock={onAddStock}
                  onAdjustStock={onAdjustStock}
                  onEditProduct={onEditProduct}
                  onDeleteProduct={onDeleteProduct}
                  formatPrice={formatPrice}
                  formatNumber={formatNumber}
                />
              )}
            />
          </div>
        </>
      )}
    </div>
  );
}
