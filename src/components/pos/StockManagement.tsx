'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useUserRole } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';

import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { BulkStockUpdateDialog } from './BulkStockUpdateDialog';
import { StockAdjustmentDialog } from './StockAdjustmentDialog';
import {
  Package,
  Plus,
  Search,
  Edit,
  Trash2,
  Filter,
  ArrowUpDown,
  X,
  Upload,
  BarChart2,
  MinusCircle,
  TrendingUp,
  DollarSign,
  Ban,
  PackagePlus,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import type { Product } from '@/types/pos';
import { useProductsStore } from '@/stores/pos-store';
import { cn, convertBengaliToEnglishNumerals } from '@/lib/utils';
import { toast } from 'sonner';
import { ProductsDB } from '@/lib/offline/indexeddb';
import { useNumberFormat } from '@/hooks/use-number-format';

interface StockManagementProps {
  onAddProduct?: () => void;
  onEditProduct?: (product: Product) => void;
  onAddStock?: (product: Product) => void;
  onDeleteProduct?: (product: Product) => void;
  onStatistics?: () => void;
}

type SortField = 'name' | 'stock' | 'price' | 'category';
type SortOrder = 'asc' | 'desc';

export function StockManagement({
  onAddProduct,
  onEditProduct,
  onAddStock,
  onDeleteProduct,
  onStatistics,
}: StockManagementProps) {
  const t = useTranslations('Stock');
  const tc = useTranslations('Common');
  const tp = useTranslations('ProductDialog');
  const userRole = useUserRole();
  const canDelete = userRole === 'ADMIN' || userRole === 'MANAGER';
  const { formatPrice } = useNumberFormat();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out' | 'inactive'>('all');
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

  // Reset category filter when viewing inactive products
  useEffect(() => {
    if (stockFilter === 'inactive' && categoryFilter !== 'all') {
      setCategoryFilter('all');
    }
  }, [stockFilter, categoryFilter]);

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
          const lowerQuery = searchQuery.toLowerCase();
          const normalizedQuery = convertBengaliToEnglishNumerals(searchQuery);
          const newlyAdded = storeProducts.filter(
            (p) =>
              !syncedResults.some((r) => r.id === p.id) &&
              p.isActive &&
              (p.name.toLowerCase().includes(lowerQuery) ||
                p.nameBn?.includes(searchQuery) ||
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
        setSearchResults(null);
        return;
      }

      const lowerQuery = query.toLowerCase();
      const normalizedQuery = convertBengaliToEnglishNumerals(query);
      const localMatches = storeProducts.filter(
        (p) =>
          p.isActive &&
          (p.name.toLowerCase().includes(lowerQuery) ||
            p.nameBn?.includes(query) ||
            p.barcode?.includes(query) ||
            convertBengaliToEnglishNumerals(p.barcode || '').includes(normalizedQuery))
      );
      setSearchResults(localMatches);
      setIsSearching(true);

      searchTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/products?search=${encodeURIComponent(query)}`);
          if (res.ok) {
            const { data } = await res.json();
            const parsedData = data.map((p: any) => ({
              ...p,
              currentStock: Number(p.currentStock) || 0,
              minStockLevel: Number(p.minStockLevel) || 0,
              buyingPrice: Number(p.buyingPrice) || 0,
              sellingPrice: Number(p.sellingPrice) || 0,
            }));
            const localOnlyMatches = localMatches.filter(
              (local) => !parsedData.some((server: any) => server.id === local.id)
            );
            setSearchResults([...parsedData, ...localOnlyMatches]);
          }
        } catch {
          // keep local results if network fails
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    [storeProducts]
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

  const getStockStatus = (product: Product) => {
    if (!product.isActive) return { label: t('inactive'), variant: 'secondary' as const };
    if (product.currentStock < 0) return { label: t('negative_stock'), variant: 'destructive' as const };
    if (product.currentStock === 0) return { label: t('out_of_stock'), variant: 'destructive' as const };
    if (product.currentStock <= product.minStockLevel) return { label: t('low_stock'), variant: 'secondary' as const };
    return { label: t('in_stock'), variant: 'default' as const };
  };

  // Get status left border color class
  const getStockBorderClass = (product: Product) => {
    if (!product.isActive) return 'border-l-gray-400 dark:border-l-gray-600';
    if (product.currentStock === 0) return 'border-l-red-500';
    if (product.currentStock <= product.minStockLevel) return 'border-l-amber-500';
    return 'border-l-green-500';
  };

  // Get stock level percentage for progress bar
  const getStockLevelPercent = (product: Product) => {
    if (product.minStockLevel === 0) return product.currentStock > 0 ? 100 : 0;
    const ratio = (product.currentStock / product.minStockLevel) * 100;
    return Math.min(Math.max(ratio, 0), 100);
  };

  // Get progress bar color class
  const getStockLevelColor = (product: Product) => {
    if (!product.isActive) return '[&>div]:bg-gray-400';
    if (product.currentStock === 0) return '[&>div]:bg-red-500';
    if (product.currentStock <= product.minStockLevel) return '[&>div]:bg-amber-500';
    return '[&>div]:bg-green-500';
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
      <div className="flex flex-col h-[calc(100vh-4rem)] md:h-screen w-full gap-2 md:gap-4 p-2 md:p-4 animate-page-enter">
        <div className="flex flex-col gap-2 shrink-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
                <Package className="w-5 h-5" />
                {t('title')}
              </h1>
              <p className="text-xs text-muted-foreground">
                {filteredProducts.length} {t('items')}
              </p>
            </div>
            
            {/* Desktop Actions */}
            <div className="hidden sm:flex gap-1.5">
              <Button variant="outline" size="sm" onClick={onStatistics} className="gap-1 h-8 px-2">
                <BarChart2 className="w-4 h-4" />
                <span className="text-xs">{t('statistics')}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsBulkUpdateOpen(true)} className="gap-1 h-8 px-2">
                <Upload className="w-4 h-4" />
                <span className="text-xs">{t('bulk_update')}</span>
              </Button>
              <Button size="sm" onClick={onAddProduct} className="gap-1 h-8 px-2 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600">
                <Plus className="w-4 h-4" />
                <span className="text-xs">{t('add_item')}</span>
              </Button>
            </div>

            {/* Mobile Actions Dropdown */}
            <div className="sm:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-8 px-2.5 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 flex items-center gap-1.5 text-xs font-semibold">
                    <span>{tc('actions') || 'Actions'}</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onAddProduct} className="gap-2">
                    <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
                    <span>{t('add_item')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsBulkUpdateOpen(true)} className="gap-2">
                    <Upload className="w-4 h-4" />
                    <span>{t('bulk_update')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onStatistics} className="gap-2">
                    <BarChart2 className="w-4 h-4" />
                    <span>{t('statistics')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Summary Value Cards — compact/scrollable on mobile */}
          <div className="flex overflow-x-auto snap-x gap-2 no-scrollbar scrollbar-none pb-1 md:grid md:grid-cols-2 lg:grid-cols-4 shrink-0">
            <Card className="min-w-[140px] shrink-0 snap-start md:min-w-0 md:shrink overflow-hidden border-green-200 dark:border-green-900/50">
              <CardContent className="p-2 bg-gradient-to-br from-green-50/80 to-green-100/30 dark:from-green-950/40 dark:to-green-900/20">
                <div className="flex items-center gap-1.5">
                  <div className="flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded-md bg-green-500/10 shrink-0">
                    <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="text-xs md:text-[10px] text-muted-foreground leading-tight">{t('total_stock_value')}</span>
                </div>
                <p className="text-lg md:text-sm lg:text-base font-bold mt-1 text-green-700 dark:text-green-400 tabular-nums">
                  {formatPrice(totalStockValue)}
                </p>
                <p className="text-[10px] text-green-600/70 dark:text-green-500/70">
                  {activeProducts.length} {t('items')}
                </p>
              </CardContent>
            </Card>
            <Card className="min-w-[140px] shrink-0 snap-start md:min-w-0 md:shrink overflow-hidden border-emerald-200 dark:border-emerald-900/50">
              <CardContent className="p-2 bg-gradient-to-br from-emerald-50/80 to-emerald-100/30 dark:from-emerald-950/40 dark:to-emerald-900/20">
                <div className="flex items-center gap-1.5">
                  <div className="flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded-md bg-emerald-500/10 shrink-0">
                    <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-xs md:text-[10px] text-muted-foreground leading-tight">{t('total_retail_value')}</span>
                </div>
                <p className="text-lg md:text-sm lg:text-base font-bold mt-1 text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {formatPrice(totalRetailValue)}
                </p>
                <p className="text-[10px] text-emerald-600/70 dark:text-emerald-500/70">{t('selling')}</p>
              </CardContent>
            </Card>
            <Card className="min-w-[140px] shrink-0 snap-start md:min-w-0 md:shrink overflow-hidden border-teal-200 dark:border-teal-900/50">
              <CardContent className="p-2 bg-gradient-to-br from-teal-50/80 to-teal-100/30 dark:from-teal-950/40 dark:to-teal-900/20">
                <div className="flex items-center gap-1.5">
                  <div className="flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded-md bg-teal-500/10 shrink-0">
                    <TrendingUp className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <span className="text-xs md:text-[10px] text-muted-foreground leading-tight">{t('potential_profit')}</span>
                </div>
                <p className="text-lg md:text-sm lg:text-base font-bold mt-1 text-teal-700 dark:text-teal-400 tabular-nums">
                  {formatPrice(potentialProfit)}
                </p>
                <p className="text-[10px] text-teal-600/70 dark:text-teal-500/70">
                  {totalRetailValue > 0 ? ((potentialProfit / totalRetailValue) * 100).toFixed(1) : '0'}% {t('profit_margin')}
                </p>
              </CardContent>
            </Card>
            <Card className="min-w-[140px] shrink-0 snap-start md:min-w-0 md:shrink overflow-hidden border-red-200 dark:border-red-900/50">
              <CardContent className="p-2 bg-gradient-to-br from-red-50/80 to-red-100/30 dark:from-red-950/40 dark:to-red-900/20">
                <div className="flex items-center gap-1.5">
                  <div className="flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded-md bg-red-500/10 shrink-0">
                    <X className="h-4 w-4 text-red-500 dark:text-red-400" />
                  </div>
                  <span className="text-xs md:text-[10px] text-muted-foreground leading-tight">{t('out_of_stock')}</span>
                </div>
                <p className="text-lg md:text-sm lg:text-base font-bold mt-1 text-red-600 dark:text-red-400 tabular-nums">
                  {outOfStockCount}
                </p>
                <p className="text-[10px] text-red-500/70 dark:text-red-400/70">
                  {lowStockCount} {t('low_stock')}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-row w-full gap-2 items-center shrink-0">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('search_placeholder')}
                value={searchQuery}
                onChange={(e) => handleSearchChange(convertBengaliToEnglishNumerals(e.target.value))}
                className="pl-9 h-9 w-full"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Stock Filter */}
            <Select value={stockFilter} onValueChange={(v: 'all' | 'low' | 'out' | 'inactive') => setStockFilter(v)}>
              <SelectTrigger className="w-9 h-9 p-0 justify-center sm:w-[140px] sm:h-9 sm:px-3 sm:justify-between shrink-0 [&>span:last-child]:hidden sm:[&>span:last-child]:inline-flex">
                <span className="hidden sm:inline">
                  <SelectValue placeholder={t('stock_status')} />
                </span>
                <Filter className="h-4 w-4 sm:hidden" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all_items')}</SelectItem>
                <SelectItem value="low">{t('low_stock')}</SelectItem>
                <SelectItem value="out">{t('out_of_stock')}</SelectItem>
                <SelectItem value="inactive">{t('inactive')}</SelectItem>
              </SelectContent>
            </Select>

            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter} disabled={stockFilter === 'inactive'}>
              <SelectTrigger className="w-9 h-9 p-0 justify-center sm:w-[200px] sm:h-9 sm:px-3 sm:justify-between shrink-0 [&>span:last-child]:hidden sm:[&>span:last-child]:inline-flex">
                <span className="hidden sm:inline flex items-center gap-2">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder={t('all_categories')} />
                </span>
                <Package className="h-4 w-4 sm:hidden" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all_categories')}</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Mobile-only Sort Button */}
            <Select
              value={`${sortField}-${sortOrder}`}
              onValueChange={(value) => {
                const [field, order] = value.split('-') as [SortField, SortOrder];
                setSortField(field);
                setSortOrder(order);
              }}
            >
              <SelectTrigger className="w-9 h-9 p-0 justify-center sm:hidden shrink-0 [&>span:last-child]:hidden">
                <ArrowUpDown className="h-4 w-4" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name-asc">{t('item_name')} (A-Z)</SelectItem>
                <SelectItem value="name-desc">{t('item_name')} (Z-A)</SelectItem>
                <SelectItem value="stock-asc">{t('stock_level')} (L-H)</SelectItem>
                <SelectItem value="stock-desc">{t('stock_level')} (H-L)</SelectItem>
                <SelectItem value="price-asc">{t('sell_price')} (L-H)</SelectItem>
                <SelectItem value="price-desc">{t('sell_price')} (H-L)</SelectItem>
                <SelectItem value="category-asc">{tc('category')} (A-Z)</SelectItem>
                <SelectItem value="category-desc">{tc('category')} (Z-A)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Product List */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-background rounded-md border pb-24">
          {isSearching && filteredProducts.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">{tc('loading')}</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mb-2 opacity-50" />
              <p>{t('no_items')}</p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden flex flex-col divide-y">
                {filteredProducts.map((product) => {
                  const status = getStockStatus(product);
                  const isSelected = selectedIds.has(product.id);
                  return (
                    <div
                      key={product.id}
                      className={cn(
                        'p-3 hover:bg-muted/50 transition-colors border-l-4 flex gap-2.5',
                        getStockBorderClass(product),
                        isSelected && 'bg-emerald-500/5 dark:bg-emerald-500/10'
                      )}
                    >
                      <div className="pt-0.5 shrink-0">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectOne(product.id)}
                          aria-label={product.name}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1.5 gap-2">
                          <div className="min-w-0">
                            <span className="font-semibold text-sm truncate block">
                              {product.nameBn || product.name}
                            </span>
                            {product.nameBn && product.nameBn !== product.name && (
                              <span className="text-xs text-muted-foreground truncate block">{product.name}</span>
                            )}
                            {product.barcode && (
                              <span className="text-[10px] font-mono text-muted-foreground block">
                                {product.barcode}
                              </span>
                            )}
                            <Badge variant="outline" className="text-[9px] px-1 h-4 mt-1">
                              {product.category}
                            </Badge>
                          </div>
                          <div className="flex flex-col items-end shrink-0 gap-1">
                            <Badge variant={status.variant} className="text-[10px] h-4.5 px-1.5">
                              {status.label}
                            </Badge>
                            <span
                              className={cn(
                                'text-sm font-bold',
                                product.currentStock < 0 && 'text-red-600',
                                product.currentStock === 0 && 'text-red-600',
                                product.currentStock > 0 &&
                                  product.currentStock <= product.minStockLevel &&
                                  'text-amber-600'
                              )}
                            >
                              {product.currentStock} {product.unit}
                            </span>
                            <span className="text-[9px] text-muted-foreground">
                              {t('min')}: {product.minStockLevel}
                            </span>
                          </div>
                        </div>

                        {/* Stock Progress Bar for Mobile */}
                        <div className="mb-2">
                          <Progress
                            value={getStockLevelPercent(product)}
                            className={cn('h-1.5', getStockLevelColor(product))}
                          />
                        </div>

                        <div className="flex justify-between items-center mt-1">
                          <div className="flex gap-2.5 text-xs text-muted-foreground">
                            <span>
                              {t('buy')}: <span className="font-medium text-foreground">{formatPrice(product.buyingPrice)}</span>
                            </span>
                            <span>
                              {t('sell')}: <span className="font-medium text-foreground">{formatPrice(product.sellingPrice)}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {product.isActive && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAddStock?.(product)}>
                                  <Plus className="w-3.5 h-3.5 text-green-600" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAdjustmentProduct(product)}>
                                  <MinusCircle className="w-3.5 h-3.5 text-amber-600" />
                                </Button>
                              </>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditProduct?.(product)}>
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            {canDelete && product.isActive && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => onDeleteProduct?.(product)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={isAllSelected ? true : isSomeSelected ? 'indeterminate' : false}
                          onCheckedChange={toggleSelectAll}
                          aria-label={t('select_all')}
                        />
                      </TableHead>
                      <TableHead className="w-[30%]">
                        <Button variant="ghost" size="sm" className="h-8 -ml-3" onClick={() => handleSort('name')}>
                          {t('item_name')}
                          <ArrowUpDown className={cn('w-4 h-4 ml-2', sortField === 'name' && 'text-primary')} />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button variant="ghost" size="sm" className="h-8 -ml-3" onClick={() => handleSort('category')}>
                          {tc('category')}
                          <ArrowUpDown className={cn('w-4 h-4 ml-2', sortField === 'category' && 'text-primary')} />
                        </Button>
                      </TableHead>
                      <TableHead className="text-right">{t('buy_price')}</TableHead>
                      <TableHead className="text-right">
                        <Button variant="ghost" size="sm" className="h-8 -ml-3" onClick={() => handleSort('price')}>
                          {t('sell_price')}
                          <ArrowUpDown className={cn('w-4 h-4 ml-2', sortField === 'price' && 'text-primary')} />
                        </Button>
                      </TableHead>
                      <TableHead className="text-right">{t('profit_margin')}</TableHead>
                      <TableHead className="text-center w-[160px]">
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => handleSort('stock')}>
                          {t('stock_level')}
                          <ArrowUpDown className={cn('w-4 h-4 ml-2', sortField === 'stock' && 'text-primary')} />
                        </Button>
                      </TableHead>
                      <TableHead className="text-center">{tc('status')}</TableHead>
                      <TableHead className="text-right">{tc('actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => {
                      const status = getStockStatus(product);
                      const isSelected = selectedIds.has(product.id);
                      const profitMargin =
                        product.sellingPrice > 0
                          ? ((product.sellingPrice - product.buyingPrice) / product.sellingPrice) * 100
                          : 0;
                      return (
                        <TableRow
                          key={product.id}
                          className={cn(
                            'group border-l-4 transition-colors',
                            getStockBorderClass(product),
                            isSelected && 'bg-emerald-500/5 dark:bg-emerald-500/10'
                          )}
                        >
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelectOne(product.id)}
                              aria-label={product.name}
                            />
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{product.nameBn || product.name}</p>
                              {product.nameBn && product.nameBn !== product.name && (
                                <p className="text-xs text-muted-foreground">{product.name}</p>
                              )}
                              {product.barcode && (
                                <p className="text-xs text-muted-foreground font-mono">{product.barcode}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {product.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatPrice(product.buyingPrice)}</TableCell>
                          <TableCell className="text-right font-medium">{formatPrice(product.sellingPrice)}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            <span className={cn(profitMargin >= 0 ? 'text-green-600' : 'text-red-600')}>
                              {profitMargin.toFixed(1)}%
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
                                  {product.currentStock} {product.unit}
                                </span>
                                <span className="text-xs text-muted-foreground">/ {product.minStockLevel}</span>
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
                                    onClick={() => setAdjustmentProduct(product)}
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
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="py-2 text-center text-sm text-muted-foreground shrink-0">
            {isLoadingMore && t('loading_more')}
          </div>
        </div>

        {/* Summary Footer */}
        <div className="shrink-0 border-t bg-muted/30 p-3 rounded-lg flex items-center justify-between text-xs sm:text-sm">
          <span className="text-muted-foreground">
            {t('showing')} {filteredProducts.length}{' '}
            {searchResults !== null ? t('results') : `${t('of')} ${storeProducts.length}`}
          </span>
          <div className="flex items-center gap-3.5 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              {t('in_stock')}: {storeProducts.filter((p) => p.currentStock > p.minStockLevel).length}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              {t('low_stock')}: {lowStockCount}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              {t('out_of_stock')}: {outOfStockCount}
            </span>
            {negativeStockCount > 0 && (
              <span className="flex items-center gap-1.5 text-red-600 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-red-700 animate-pulse" />
                {t('negative_stock')}: {negativeStockCount}
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
              {selectedIds.size} {t('selected_count')} — {tp('delete_confirm', { name: '' })}
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

