'use client';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useUserRole } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BulkStockUpdateDialog } from '../BulkStockUpdateDialog';
import { StockAdjustmentDialog } from '../StockAdjustmentDialog';
import {
  X,
  TrendingUp,
  DollarSign,
  Ban,
  PackagePlus,
  Trash2,
} from 'lucide-react';
import type { Product } from '@/types/pos';
import { useProductsStore } from '@/stores/pos-store';
import { convertBengaliToEnglishNumerals, convertEnglishToBengaliNumerals, normalizeSearchText } from '@/lib/utils';
import { toast } from 'sonner';
import { ProductsDB } from '@/lib/offline/indexeddb';
import { useNumberFormat } from '@/hooks/use-number-format';
import type { StockManagementProps, SortField, SortOrder, StockFilter } from './types';
import { StockToolbar } from './StockToolbar';
import { StockProductList } from './StockProductList';

export function StockManagement({
  onAddProduct,
  onEditProduct,
  onAddStock,
  onDeleteProduct,
  onStatistics,
}: StockManagementProps) {
  const t = useTranslations('Stock');
  const tc = useTranslations('Common');
  const locale = useLocale();
  const userRole = useUserRole();
  const canDelete = userRole === 'ADMIN' || userRole === 'MANAGER';
  const { formatPrice, formatNumber } = useNumberFormat();
  const formatNum = (num: number) => locale === 'bn' ? convertEnglishToBengaliNumerals(num) : num;

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [isBulkUpdateOpen, setIsBulkUpdateOpen] = useState(false);
  const [adjustmentProduct, setAdjustmentProduct] = useState<Product | null>(null);

  // Batch selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  // Server-side search state
  const [searchResults, setSearchResults] = useState<Product[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Infinite scroll state
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const storeProducts = useProductsStore((state) => state.products);
  const hasMore = useProductsStore((state) => state.hasMore);
  const nextCursor = useProductsStore((state) => state.nextCursor);
  const appendProducts = useProductsStore((state) => state.appendProducts);
  const categories = useProductsStore((state) => state.categories);
  const updateProduct = useProductsStore((state) => state.updateProduct);
  const removeProduct = useProductsStore((state) => state.removeProduct);

  // Use search results when actively searching, otherwise use store products
  const products: Product[] = searchResults !== null ? searchResults : storeProducts;

  // Reset category filter and fetch inactive products when viewing inactive products
  useEffect(() => {
    if (stockFilter === 'inactive') {
      setCategoryFilter('all');
      setIsSearching(true);
      fetch('/api/products?includeInactive=true&limit=10000')
        .then((res) => res.json())
        .then((json) => {
          if (json.data) {
            const parsedData = json.data.map((p: any) => ({
              ...p,
              currentStock: Number(p.currentStock) || 0,
              minStockLevel: Number(p.minStockLevel) || 0,
              buyingPrice: Number(p.buyingPrice) || 0,
              sellingPrice: Number(p.sellingPrice) || 0,
            }));
            setSearchResults(parsedData.filter((p: any) => !p.isActive));
          }
        })
        .catch(console.error)
        .finally(() => setIsSearching(false));
    } else if (!searchQuery) {
      setSearchResults(null);
    }
  }, [stockFilter, searchQuery]);

  const prevStoreCountRef = useRef(storeProducts.length);
  useEffect(() => {
    if (searchResults !== null) {
      setSearchResults((prevResults) => {
        if (!prevResults) return null;
        let hasChanges = false;

        const syncedResults = prevResults.map((item) => {
          const storeItem = storeProducts.find((p) => p.id === item.id);
          if (storeItem && storeItem !== item) {
            hasChanges = true;
            return storeItem;
          }
          return item;
        });

        const prev = prevStoreCountRef.current;
        if (storeProducts.length > prev) {
          const normalizedQuery = normalizeSearchText(searchQuery);
          const newlyAdded = storeProducts.filter(
            (p) =>
              !syncedResults.some((r) => r.id === p.id) &&
              (normalizeSearchText(p.name).includes(normalizedQuery) ||
                (p.nameBn && normalizeSearchText(p.nameBn).includes(normalizedQuery)) ||
                p.barcode?.includes(searchQuery) ||
                convertBengaliToEnglishNumerals(p.barcode || '').includes(normalizedQuery))
          );

          if (newlyAdded.length > 0) {
            hasChanges = true;
            syncedResults.unshift(...newlyAdded);
          }
        }

        prevStoreCountRef.current = storeProducts.length;
        return hasChanges ? syncedResults : prevResults;
      });
    } else {
      prevStoreCountRef.current = storeProducts.length;
    }
  }, [storeProducts, searchResults, searchQuery]);

  // Server-side search with debounce
  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (!query.trim()) {
        if (stockFilter === 'inactive') {
          setIsSearching(true);
          fetch('/api/products?includeInactive=true&limit=10000')
            .then((res) => res.json())
            .then((json) => {
              if (json.data) {
                const parsedData = json.data.map((p: any) => ({
                  ...p,
                  currentStock: Number(p.currentStock) || 0,
                  minStockLevel: Number(p.minStockLevel) || 0,
                  buyingPrice: Number(p.buyingPrice) || 0,
                  sellingPrice: Number(p.sellingPrice) || 0,
                }));
                setSearchResults(parsedData.filter((p: any) => !p.isActive));
              }
            })
            .catch(console.error)
            .finally(() => setIsSearching(false));
        } else {
          setSearchResults(null);
        }
        return;
      }

      const searchUrl = stockFilter === 'inactive'
        ? `/api/products?search=${encodeURIComponent(query)}&includeInactive=true`
        : `/api/products?search=${encodeURIComponent(query)}`;

      setIsSearching(true);

      searchTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(searchUrl);
          if (res.ok) {
            const { data } = await res.json();
            const parsedData = data.map((p: any) => ({
              ...p,
              currentStock: Number(p.currentStock) || 0,
              minStockLevel: Number(p.minStockLevel) || 0,
              buyingPrice: Number(p.buyingPrice) || 0,
              sellingPrice: Number(p.sellingPrice) || 0,
            }));
            setSearchResults(parsedData);
          }
        } catch {
          // keep local results if network fails
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    [stockFilter, storeProducts]
  );

  // Infinite scroll: load more when sentinel is visible
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || !nextCursor || searchResults !== null) return;
    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/products?limit=10000&cursor=${nextCursor}`);
      if (res.ok) {
        const { data, nextCursor: newCursor } = await res.json();
        appendProducts(data, !!newCursor, newCursor ?? null);
      }
    } catch {
      /* silently fail */
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, nextCursor, searchResults, appendProducts]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // Filter and sort (client-side on already-loaded data)
  const filteredProducts = useMemo(() => {
    let result = products;

    if (stockFilter === 'inactive') {
      result = result.filter((p) => !p.isActive);
    } else {
      result = result.filter((p) => p.isActive);
      if (categoryFilter !== 'all') {
        result = result.filter((p) => p.category === categoryFilter);
      }

      if (stockFilter === 'low') {
        result = result.filter((p) => p.currentStock <= p.minStockLevel && p.currentStock > 0);
      } else if (stockFilter === 'out') {
        result = result.filter((p) => p.currentStock === 0);
      }
    }

    result = [...result]; // Shallow copy before sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'stock':
          comparison = a.currentStock - b.currentStock;
          break;
        case 'price':
          comparison = a.sellingPrice - b.sellingPrice;
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [products, categoryFilter, stockFilter, sortField, sortOrder]);

  // Active products for statistics cards
  const activeProducts = useMemo(() => storeProducts.filter((p) => p.isActive), [storeProducts]);

  const totalStockValue = useMemo(() => {
    return activeProducts
      .filter((p) => p.currentStock > 0)
      .reduce((sum, p) => sum + p.currentStock * p.buyingPrice, 0);
  }, [activeProducts]);

  const totalRetailValue = useMemo(() => {
    return activeProducts
      .filter((p) => p.currentStock > 0)
      .reduce((sum, p) => sum + p.currentStock * p.sellingPrice, 0);
  }, [activeProducts]);

  const potentialProfit = useMemo(() => {
    return totalRetailValue - totalStockValue;
  }, [totalRetailValue, totalStockValue]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Memoize counts to prevent lag on input
  const { negativeStockCount, lowStockCount, outOfStockCount } = useMemo(() => {
    let negative = 0,
      low = 0,
      out = 0;
    for (let i = 0; i < storeProducts.length; i++) {
      const p = storeProducts[i];
      if (p.isActive) {
        if (p.currentStock < 0) negative++;
        else if (p.currentStock === 0) out++;
        else if (p.currentStock <= p.minStockLevel && p.currentStock > 0) low++;
      }
    }
    return { negativeStockCount: negative, lowStockCount: low, outOfStockCount: out };
  }, [storeProducts]);

  // Batch selection helper functions
  const isAllSelected = filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.has(p.id));
  const isSomeSelected = filteredProducts.some((p) => selectedIds.has(p.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Batch Deactivate operation
  const handleBatchDeactivate = async () => {
    if (selectedIds.size === 0) {
      toast.error(t('no_products_selected'));
      return;
    }
    setSaving(true);
    try {
      let successCount = 0;
      for (const id of selectedIds) {
        const product = storeProducts.find((p) => p.id === id);
        if (product && product.isActive) {
          const updated = {
            ...product,
            isActive: false,
          };
          const res = await fetch('/api/products', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated),
          });
          if (res.ok) {
            const { data } = await res.json();
            updateProduct(id, data);
            await ProductsDB.upsert(data);
            successCount++;
          }
        }
      }
      toast.success(t('batch_deactivate_success'));
      setSelectedIds(new Set());
    } catch (error) {
      toast.error(t('batch_operation_failed'));
    } finally {
      setSaving(false);
    }
  };

  // Batch Delete operation
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) {
      toast.error(t('no_products_selected'));
      return;
    }
    setSaving(true);
    try {
      for (const id of selectedIds) {
        const res = await fetch(`/api/products?id=${id}`, { method: 'DELETE' });
        if (res.ok) {
          removeProduct(id);
          await ProductsDB.delete(id);
        }
      }
      toast.success(t('batch_delete_success'));
      setSelectedIds(new Set());
      setShowBatchDeleteDialog(false);
    } catch (error) {
      toast.error(t('batch_operation_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-col h-full md:h-screen w-full gap-2 md:gap-4 px-2 pt-2 pb-0 md:p-4 animate-page-enter">
        <StockToolbar
          itemCount={filteredProducts.length}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onClearSearch={() => {
            setSearchQuery('');
            setSearchResults(null);
          }}
          stockFilter={stockFilter}
          onStockFilterChange={setStockFilter}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          categories={categories}
          sortField={sortField}
          sortOrder={sortOrder}
          onSortChange={(field, order) => {
            setSortField(field);
            setSortOrder(order);
          }}
          onStatistics={onStatistics}
          onBulkUpdate={() => setIsBulkUpdateOpen(true)}
          onAddProduct={onAddProduct}
        >
          {/* Summary Value Cards — compact/scrollable on mobile */}
          <div className="flex overflow-x-auto snap-x gap-2 no-scrollbar scrollbar-none pb-1 md:grid md:grid-cols-2 lg:grid-cols-4 shrink-0">
            <Card className="min-w-[120px] shrink-0 snap-start md:min-w-0 md:shrink overflow-hidden border-green-200 dark:border-green-900/50 !py-0 !gap-0">
              <CardContent className="!p-1.5 md:!p-2 bg-gradient-to-br from-green-50/80 to-green-100/30 dark:from-green-950/40 dark:to-green-900/20">
                <div className="flex items-center gap-1">
                  <div className="flex h-3.5 w-3.5 md:h-6 md:w-6 items-center justify-center rounded bg-green-500/10 shrink-0">
                    <DollarSign className="h-2.5 w-2.5 md:h-4 md:w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-tight">{t('total_stock_value')}</span>
                </div>
                <p className="text-sm font-bold text-green-700 dark:text-green-400 tabular-nums">
                  {formatPrice(totalStockValue)}
                </p>
                <p className="text-[9px] text-green-600/70 dark:text-green-500/70">
                  {formatNumber(activeProducts.length)} {t('items')}
                </p>
              </CardContent>
            </Card>
            <Card className="min-w-[120px] shrink-0 snap-start md:min-w-0 md:shrink overflow-hidden border-emerald-200 dark:border-emerald-900/50 !py-0 !gap-0">
              <CardContent className="!p-1.5 md:!p-2 bg-gradient-to-br from-emerald-50/80 to-emerald-100/30 dark:from-emerald-950/40 dark:to-emerald-900/20">
                <div className="flex items-center gap-1">
                  <div className="flex h-3.5 w-3.5 md:h-6 md:w-6 items-center justify-center rounded bg-emerald-500/10 shrink-0">
                    <TrendingUp className="h-2.5 w-2.5 md:h-4 md:w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-tight">{t('total_retail_value')}</span>
                </div>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {formatPrice(totalRetailValue)}
                </p>
                <p className="text-[9px] text-emerald-600/70 dark:text-emerald-500/70">{t('selling')}</p>
              </CardContent>
            </Card>
            <Card className="min-w-[120px] shrink-0 snap-start md:min-w-0 md:shrink overflow-hidden border-teal-200 dark:border-teal-900/50 !py-0 !gap-0">
              <CardContent className="!p-1.5 md:!p-2 bg-gradient-to-br from-teal-50/80 to-teal-100/30 dark:from-teal-950/40 dark:to-teal-900/20">
                <div className="flex items-center gap-1">
                  <div className="flex h-3.5 w-3.5 md:h-6 md:w-6 items-center justify-center rounded bg-teal-500/10 shrink-0">
                    <TrendingUp className="h-2.5 w-2.5 md:h-4 md:w-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-tight">{t('potential_profit')}</span>
                </div>
                <p className="text-sm font-bold text-teal-700 dark:text-teal-400 tabular-nums">
                  {formatPrice(potentialProfit)}
                </p>
                <p className="text-[9px] text-teal-600/70 dark:text-teal-500/70">
                  {totalRetailValue > 0 ? formatNumber(Number(((potentialProfit / totalRetailValue) * 100).toFixed(1))) : formatNumber(0)}% {t('profit_margin')}
                </p>
              </CardContent>
            </Card>
            <Card className="min-w-[120px] shrink-0 snap-start md:min-w-0 md:shrink overflow-hidden border-red-200 dark:border-red-900/50 !py-0 !gap-0">
              <CardContent className="!p-1.5 md:!p-2 bg-gradient-to-br from-red-50/80 to-red-100/30 dark:from-red-950/40 dark:to-red-900/20">
                <div className="flex items-center gap-1">
                  <div className="flex h-3.5 w-3.5 md:h-6 md:w-6 items-center justify-center rounded bg-red-500/10 shrink-0">
                    <X className="h-2.5 w-2.5 md:h-4 md:w-4 text-red-500 dark:text-red-400" />
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-tight">{t('out_of_stock')}</span>
                </div>
                <p className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">
                  {formatNumber(outOfStockCount)}
                </p>
                <p className="text-[9px] text-red-500/70 dark:text-red-400/70">
                  {formatNumber(lowStockCount)} {t('low_stock')}
                </p>
              </CardContent>
            </Card>
          </div>
        </StockToolbar>

        <StockProductList
          products={filteredProducts}
          isSearching={isSearching}
          selectedIds={selectedIds}
          canDelete={canDelete}
          sortField={sortField}
          onSort={handleSort}
          onToggleSelectAll={toggleSelectAll}
          onToggleSelectOne={toggleSelectOne}
          isAllSelected={isAllSelected}
          isSomeSelected={isSomeSelected}
          onAddStock={onAddStock}
          onEditProduct={onEditProduct}
          onDeleteProduct={onDeleteProduct}
          onAdjustStock={setAdjustmentProduct}
          formatPrice={formatPrice}
          formatNumber={formatNumber}
          sentinelRef={sentinelRef}
          isLoadingMore={isLoadingMore}
        />

        {/* Summary Footer */}
        <div className="shrink-0 border-t bg-muted/30 px-2 py-1.5 md:p-3 rounded-lg flex items-center justify-between text-xs sm:text-sm flex-wrap gap-y-1">
          <span className="text-muted-foreground">
            {t('showing')} {formatNum(filteredProducts.length)}{' '}
            {searchResults !== null ? t('results') : `${t('of')} ${formatNum(storeProducts.length)}`}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {t('in_stock')}: {formatNum(storeProducts.filter((p) => p.currentStock > p.minStockLevel).length)}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {t('low_stock')}: {formatNum(lowStockCount)}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {t('out_of_stock')}: {formatNum(outOfStockCount)}
            </span>
            {negativeStockCount > 0 && (
              <span className="flex items-center gap-1 text-red-600 font-semibold">
                <span className="w-2 h-2 rounded-full bg-red-700 animate-pulse" />
                {t('negative_stock')}: {formatNum(negativeStockCount)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Batch Operations Bar - Floating at bottom */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 bg-card border shadow-lg rounded-xl px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-semibold">
                {selectedIds.size} {t('selected_count')}
              </Badge>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedIds(new Set())}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={handleBatchDeactivate}
                disabled={saving}
              >
                <Ban className="h-3.5 w-3.5" />
                {t('deactivate_selected')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={() => {
                  const firstSelectedId = Array.from(selectedIds)[0];
                  const firstProduct = storeProducts.find((p) => p.id === firstSelectedId);
                  if (firstProduct) {
                    onAddStock?.(firstProduct);
                  }
                }}
                disabled={saving}
              >
                <PackagePlus className="h-3.5 w-3.5" />
                {t('add_stock_selected')}
              </Button>
              {canDelete && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5 text-xs h-8"
                  onClick={() => setShowBatchDeleteDialog(true)}
                  disabled={saving}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('delete_selected')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation */}
      <AlertDialog open={showBatchDeleteDialog} onOpenChange={setShowBatchDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_selected')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('batch_delete_confirm', { count: formatNum(selectedIds.size) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchDelete} className="bg-red-600 hover:bg-red-700">
              {tc('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkStockUpdateDialog open={isBulkUpdateOpen} onOpenChange={setIsBulkUpdateOpen} />
      <StockAdjustmentDialog
        product={adjustmentProduct}
        open={!!adjustmentProduct}
        onOpenChange={(open) => {
          if (!open) setAdjustmentProduct(null);
        }}
      />
    </>
  );
}

export default StockManagement;
