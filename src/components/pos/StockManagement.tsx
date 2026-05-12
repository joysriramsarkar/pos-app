'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
} from 'lucide-react';
import type { Product } from '@/types/pos';
import { useProductsStore } from '@/stores/pos-store';
import { cn, convertBengaliToEnglishNumerals } from '@/lib/utils';

interface StockManagementProps {
  onAddProduct?: () => void;
  onEditProduct?: (product: Product) => void;
  onAddStock?: (product: Product) => void;
  onDeleteProduct?: (product: Product) => void;
  onStatistics?: () => void;
}

type SortField = 'name' | 'stock' | 'price' | 'category';
type SortOrder = 'asc' | 'desc';

export function StockManagement({ onAddProduct, onEditProduct, onAddStock, onDeleteProduct, onStatistics }: StockManagementProps) {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role;
  const canDelete = userRole === 'ADMIN' || userRole === 'MANAGER';

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [isBulkUpdateOpen, setIsBulkUpdateOpen] = useState(false);
  const [adjustmentProduct, setAdjustmentProduct] = useState<Product | null>(null);

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

  // Use search results when actively searching, otherwise use store products
  const products: Product[] = searchResults !== null ? searchResults : storeProducts;

  // When a new product is added to the store while searching, inject it into results
  const prevStoreCountRef = useRef(storeProducts.length);
  useEffect(() => {
    if (searchResults !== null) {
      setSearchResults(prevResults => {
        if (!prevResults) return null;
        let hasChanges = false;
        
        const syncedResults = prevResults.map(item => {
          const storeItem = storeProducts.find(p => p.id === item.id);
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
          const newlyAdded = storeProducts.filter(p => 
            !syncedResults.some(r => r.id === p.id) &&
            p.isActive && (
              p.name.toLowerCase().includes(lowerQuery) ||
              p.nameBn?.includes(searchQuery) ||
              p.barcode?.includes(searchQuery) ||
              convertBengaliToEnglishNumerals(p.barcode || '').includes(normalizedQuery)
            )
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
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(query)}`);
        if (res.ok) {
          const { data } = await res.json();
          setSearchResults(data);
        }
      } catch {
        // offline fallback: search local store
        const lowerQuery = query.toLowerCase();
        const normalizedQuery = convertBengaliToEnglishNumerals(query);
        setSearchResults(storeProducts.filter(p =>
          p.isActive && (
            p.name.toLowerCase().includes(lowerQuery) ||
            p.nameBn?.includes(query) ||
            p.barcode?.includes(query) ||
            convertBengaliToEnglishNumerals(p.barcode || '').includes(normalizedQuery)
          )
        ));
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [storeProducts]);

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
    } catch { /* silently fail */ } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, nextCursor, searchResults, appendProducts]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // Filter and sort (client-side on already-loaded data)
  const filteredProducts = useMemo(() => {
    let result = products.filter(p => p.isActive);

    if (categoryFilter !== 'all') {
      result = result.filter(p => p.category === categoryFilter);
    }

    if (stockFilter === 'low') {
      result = result.filter(p => p.currentStock <= p.minStockLevel && p.currentStock > 0);
    } else if (stockFilter === 'out') {
      result = result.filter(p => p.currentStock === 0);
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name': comparison = a.name.localeCompare(b.name); break;
        case 'stock': comparison = a.currentStock - b.currentStock; break;
        case 'price': comparison = a.sellingPrice - b.sellingPrice; break;
        case 'category': comparison = a.category.localeCompare(b.category); break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [products, categoryFilter, stockFilter, sortField, sortOrder]);

  const totalStockValue = useMemo(() => {
    return products
      .filter(p => p.isActive && p.currentStock > 0)
      .reduce((sum, p) => sum + (p.currentStock * p.buyingPrice), 0);
  }, [products]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getStockStatus = (product: Product) => {
    if (product.currentStock < 0) return { label: 'Negative Stock', variant: 'destructive' as const };
    if (product.currentStock === 0) return { label: 'Out of Stock', variant: 'destructive' as const };
    if (product.currentStock <= product.minStockLevel) return { label: 'Low Stock', variant: 'secondary' as const };
    return { label: 'In Stock', variant: 'default' as const };
  };

  // Memoize expensive calculations to prevent lag on every keystroke
  const { negativeStockCount, lowStockCount, outOfStockCount } = useMemo(() => {
    let negative = 0, low = 0, out = 0;
    for (let i = 0; i < storeProducts.length; i++) {
      const p = storeProducts[i];
      if (p.currentStock < 0) negative++;
      else if (p.currentStock === 0) out++;
      else if (p.currentStock <= p.minStockLevel && p.currentStock > 0) low++;
    }
    return { negativeStockCount: negative, lowStockCount: low, outOfStockCount: out };
  }, [storeProducts]);

  return (
    <>
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b bg-background p-4">
        <div className="flex items-start justify-between gap-2 mb-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Package className="w-6 h-6" />
              Inventory Management
            </h1>
            <p className="text-sm text-muted-foreground">
              {storeProducts.length} items • Total Value: {formatPrice(totalStockValue)} • {negativeStockCount > 0 && <span className="text-red-600 font-semibold">{negativeStockCount} negative stock • </span>}{lowStockCount} low stock • {outOfStockCount} out of stock
            </p>
          </div>
          <div className='flex gap-2 flex-wrap'>
            <Button variant="outline" onClick={onStatistics}>
                <BarChart2 className="w-4 h-4 mr-2" />
                Statistics
            </Button>
            <Button variant="outline" onClick={() => setIsBulkUpdateOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Bulk Update
            </Button>
            <Button onClick={onAddProduct} className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
                <Plus className="w-4 h-4 mr-2" />
                Add Item
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-50">
            <label htmlFor="stock-search" className="sr-only">Search items</label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="stock-search"
              name="stock-search"
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(convertBengaliToEnglishNumerals(e.target.value))}
              className="pl-9"
              aria-label="Search items"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 md:right-1 top-1/2 -translate-y-1/2 h-8 w-8 md:h-7 md:w-7 p-0"
                onClick={() => { setSearchQuery(''); setSearchResults(null); }}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Category Filter */}
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-35">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Stock Filter */}
          <Select value={stockFilter} onValueChange={(v: 'all' | 'low' | 'out') => setStockFilter(v)}>
            <SelectTrigger className="w-32.5">
              <SelectValue placeholder="Stock Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Items</SelectItem>
              <SelectItem value="low">Low Stock</SelectItem>
              <SelectItem value="out">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Product List */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-[40%]">
                <Button variant="ghost" size="sm" className="h-8 -ml-3" onClick={() => handleSort('name')}>
                  Item Name
                  <ArrowUpDown className={cn("w-4 h-4 ml-2", sortField === 'name' && "text-primary")} />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="h-8 -ml-3" onClick={() => handleSort('category')}>
                  Category
                  <ArrowUpDown className={cn("w-4 h-4 ml-2", sortField === 'category' && "text-primary")} />
                </Button>
              </TableHead>
              <TableHead className="text-right">Buy Price</TableHead>
              <TableHead className="text-right">
                <Button variant="ghost" size="sm" className="h-8 -ml-3" onClick={() => handleSort('price')}>
                  Sell Price
                  <ArrowUpDown className={cn("w-4 h-4 ml-2", sortField === 'price' && "text-primary")} />
                </Button>
              </TableHead>
              <TableHead className="text-center">
                <Button variant="ghost" size="sm" className="h-8 -ml-3" onClick={() => handleSort('stock')}>
                  Stock
                  <ArrowUpDown className={cn("w-4 h-4 ml-2", sortField === 'stock' && "text-primary")} />
                </Button>
              </TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isSearching && filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  Searching...
                </TableCell>
              </TableRow>
            ) : filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No items found</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product) => {
                const status = getStockStatus(product);
                return (
                  <TableRow key={product.id} className="group">
                    <TableCell>
                      <div>
                        <p className="font-medium">{product.name}</p>
                        {product.nameBn && (
                          <p className="text-xs text-muted-foreground">{product.nameBn}</p>
                        )}
                        {product.barcode && (
                          <p className="text-xs text-muted-foreground font-mono">{product.barcode}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{product.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatPrice(product.buyingPrice)}</TableCell>
                    <TableCell className="text-right font-medium">{formatPrice(product.sellingPrice)}</TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "font-medium",
                        product.currentStock < 0 && "text-red-600 font-bold",
                        product.currentStock === 0 && "text-red-600",
                        product.currentStock > 0 && product.currentStock <= product.minStockLevel && "text-amber-600"
                      )}>
                        {product.currentStock} {product.unit}
                        {product.currentStock < 0 && ' ⚠️'}
                      </span>
                      <p className="text-xs text-muted-foreground">Min: {product.minStockLevel}</p>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={status.variant} className="text-xs">
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => onAddStock?.(product)}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          <span className="hidden sm:inline">Stock</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          title="স্টক কমান (Adjustment)"
                          onClick={() => setAdjustmentProduct(product)}
                        >
                          <MinusCircle className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => onEditProduct?.(product)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => onDeleteProduct?.(product)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="py-3 text-center text-sm text-muted-foreground">
          {isLoadingMore && 'Loading more...'}
        </div>
      </div>

      {/* Summary Footer */}
      <div className="shrink-0 border-t bg-muted/30 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Showing {filteredProducts.length}{searchResults !== null ? ' results' : ` of ${storeProducts.length} items`}
          </span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              In Stock: {storeProducts.filter(p => p.currentStock > p.minStockLevel).length}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Low: {lowStockCount}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Out: {outOfStockCount}
            </span>
            {negativeStockCount > 0 && (
              <span className="flex items-center gap-1 text-red-600 font-semibold">
                <span className="w-2 h-2 rounded-full bg-red-700" />
                Negative: {negativeStockCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
    <BulkStockUpdateDialog open={isBulkUpdateOpen} onOpenChange={setIsBulkUpdateOpen} />
    <StockAdjustmentDialog
      product={adjustmentProduct}
      open={!!adjustmentProduct}
      onOpenChange={(open) => { if (!open) setAdjustmentProduct(null); }}
    />
    </>
  );
}

export default StockManagement;
