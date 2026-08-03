'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, X, Grid3X3, LayoutGrid, Package, Camera, Loader2 } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { CameraScannerDialog } from './CameraScannerDialog';
import { Capacitor } from '@capacitor/core';
import type { Product } from '@/types/pos';
import { useProductsStore, useUIStore, useCartStore, useProductUsageStore } from '@/stores/pos-store';
import { cn, convertBengaliToEnglishNumerals, normalizeSearchText } from '@/lib/utils';
import { useTranslations, useLocale } from 'next-intl';

const cleanSearchQuery = (q: string) => q.replace(/rs\.?|₹|৳|'/gi, '').trim();
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNumberFormat } from '@/hooks/use-number-format';

type ViewMode = 'grid' | 'compact';

interface ProductGridProps {
  products?: Product[];
  onProductSelect?: (product: Product) => void;
  showSearch?: boolean;
  showCategories?: boolean;
  showViewToggle?: boolean;
  searchFocusKey?: number;
}

export function ProductGrid({
  products: externalProducts,
  onProductSelect,
  showSearch = true,
  showCategories = true,
  showViewToggle = true,
  searchFocusKey,
}: ProductGridProps) {
  const t = useTranslations('Billing');
  const tc = useTranslations('Common');



  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [cameraScanError, setCameraScanError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hasSetMobileDefaultView = useRef(false);

  // Prefer compact product tiles on phones for denser browsing
  useEffect(() => {
    if (isMobile && !hasSetMobileDefaultView.current) {
      setViewMode('compact');
      hasSetMobileDefaultView.current = true;
    }
  }, [isMobile]);

  useEffect(() => {
    if (searchFocusKey && searchInputRef.current) {
      searchInputRef.current.focus({ preventScroll: true });
      searchInputRef.current.select();
    }
  }, [searchFocusKey]);

  const storeProducts = useProductsStore((state) => state.products);
  const isStoreLoading = useProductsStore((state) => state.isLoading);
  const lastUpdated = useProductsStore((state) => state.lastUpdated);
  const storeCategories = useProductsStore((state) => state.categories);
  const hasMore = useProductsStore((state) => state.hasMore);
  const nextCursor = useProductsStore((state) => state.nextCursor);
  const appendProducts = useProductsStore((state) => state.appendProducts);


  const storeSearchQuery = useUIStore((state) => state.searchQuery);
  const selectedCategoryId = useUIStore((state) => state.selectedCategoryId);
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string | null>(null);
  const setSearchQuery = useUIStore((state) => state.setSearchQuery);
  const setSelectedCategoryId = useUIStore((state) => state.setSelectedCategoryId);

  const isNativeApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
  const showCameraScan = isNativeApp || isMobile;

  const { toast } = useToast();
  const addItem = useCartStore((state) => state.addItem);

  // Use external products if provided, otherwise use store products
  const products = externalProducts || storeProducts;
  const searchQuery = externalProducts ? localSearchQuery : storeSearchQuery;

  // Pre-compute a map for O(1) barcode lookups
  const barcodeMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((product) => {
      if (product.barcode) {
        const normalized = convertBengaliToEnglishNumerals(product.barcode);
        if (!map.has(normalized)) {
          map.set(normalized, product);
        }
      }
    });
    return map;
  }, [products]);

  const productUsage = useProductUsageStore((state) => state.usage);
  const getSortWeight = useProductUsageStore((state) => state.getSortWeight);
  const fetchMonthlyTopSales = useProductUsageStore((state) => state.fetchMonthlyTopSales);

  useEffect(() => {
    fetchMonthlyTopSales();
  }, [fetchMonthlyTopSales]);

  // Filter products based on search and category
  const filteredProducts = useMemo(() => {
    const filtered = products.filter((product) => {
      if (!product.isActive) return false;
      if (selectedCategoryId && product.category !== selectedCategoryId) return false;
      if (selectedSubCategoryId && product.subCategory !== selectedSubCategoryId) return false;
      if (searchQuery) {
        const cleaned = cleanSearchQuery(searchQuery);
        const normalizedQuery = normalizeSearchText(cleaned);

        return (
          normalizeSearchText(product.name).includes(normalizedQuery) ||
          (product.nameBn && normalizeSearchText(product.nameBn).includes(normalizedQuery)) ||
          product.barcode?.includes(cleaned) ||
          convertBengaliToEnglishNumerals(product.barcode || '').includes(normalizedQuery) ||
          product.sellingPrice.toString() === normalizedQuery
        );
      }
      return true;
    });

    if (searchQuery) {
      filtered.sort((a, b) => {
        const usageA = getSortWeight(a.id);
        const usageB = getSortWeight(b.id);
        if (usageB !== usageA) return usageB - usageA;
        return a.name.localeCompare(b.name);
      });
    }

    return filtered;
  }, [products, searchQuery, selectedCategoryId, selectedSubCategoryId, getSortWeight]);

  const [renderLimit, setRenderLimit] = useState(100);

  // Get dynamic subcategories based on selected category
  const currentSubCategories = useMemo(() => {
    if (!selectedCategoryId) return [];
    const subcats = new Set<string>();
    products.forEach(p => {
      if (p.category === selectedCategoryId && p.subCategory) {
        subcats.add(p.subCategory);
      }
    });
    return Array.from(subcats).sort();
  }, [products, selectedCategoryId]);

  // Group products by category for display
  const productsByCategory = useMemo(() => {
    const grouped: Record<string, Product[]> = {};
    const displayedProducts = filteredProducts.slice(0, renderLimit);
    displayedProducts.forEach((product) => {
      if (!grouped[product.category]) grouped[product.category] = [];
      grouped[product.category].push(product);
    });
    return grouped;
  }, [filteredProducts, renderLimit]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value;
      if (externalProducts) { setLocalSearchQuery(query); return; }
      // Store raw value — conversion only happens at barcode match time
      setSearchQuery(query);
      setRenderLimit(50); // Reset render limit on search
    },
    [externalProducts, setSearchQuery]
  );

  const clearSearch = useCallback(() => {
    if (externalProducts) setLocalSearchQuery('');
    else setSearchQuery('');
    setRenderLimit(100);
  }, [externalProducts, setSearchQuery]);

  const handleCameraBarcode = useCallback(
    (barcode: string) => {
      const cleanedBarcode = barcode.replace(/\s+/g, '');
      const normalizedBarcode = convertBengaliToEnglishNumerals(cleanedBarcode);
      const matchedProduct = barcodeMap.get(normalizedBarcode);

      if (matchedProduct) {
        if (externalProducts) onProductSelect?.(matchedProduct);
        else addItem(matchedProduct, 1);
        setCameraScanError(null);
        toast({ title: t('scanned'), description: matchedProduct.name });
        if (navigator?.vibrate) navigator.vibrate(50);
      } else {
        setCameraScanError(`${t('item_not_found')}: ${cleanedBarcode}`);
        if (externalProducts) setLocalSearchQuery(barcode);
        else setSearchQuery(barcode);
      }
    },
    [barcodeMap, externalProducts, onProductSelect, addItem, setSearchQuery, toast]
  );

  const handleCategorySelect = useCallback(
    (category: string | null) => {
      setSelectedCategoryId(category === selectedCategoryId ? null : category);
      setSelectedSubCategoryId(null); // Reset subcategory when main category changes
      setRenderLimit(100); // Reset render limit on category change
    },
    [selectedCategoryId, setSelectedCategoryId]
  );

  const handleSubCategorySelect = useCallback(
    (subCategory: string | null) => {
      setSelectedSubCategoryId(subCategory === selectedSubCategoryId ? null : subCategory);
      setRenderLimit(100);
    },
    [selectedSubCategoryId]
  );

  const clearFilters = useCallback(() => {
    clearSearch();
    setSelectedCategoryId(null);
    setSelectedSubCategoryId(null);
    setRenderLimit(100);
  }, [clearSearch, setSelectedCategoryId]);


  const observerTarget = useRef<HTMLDivElement>(null);

  const loadMoreProducts = useCallback(async () => {
    if (isLoadingMore || !hasMore || !nextCursor || externalProducts) return;
    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/products?limit=50&cursor=${nextCursor}`);
      if (res.ok) {
        const { data, nextCursor: newNextCursor } = await res.json();
        appendProducts(data, !!newNextCursor, newNextCursor);
      }
    } catch (error) {
      console.error('Error loading more products', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, nextCursor, externalProducts, appendProducts]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          if (renderLimit < filteredProducts.length) {
            setRenderLimit(prev => prev + 100);
          } else if (hasMore && !isLoadingMore) {
            loadMoreProducts();
          }
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );
    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, renderLimit, filteredProducts.length, loadMoreProducts]);



  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-background/50">
      {/* Search and Filter Controls */}
      {showSearch && (
        <div className="flex flex-col gap-2 sm:gap-3 p-2 sm:p-4 border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-10 shadow-sm">
          <label htmlFor="product-search" className="sr-only">Search products</label>
          <div className="flex gap-1.5 sm:gap-2">
            <div className="relative flex-1 group">
              <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                id="product-search"
                name="product-search"
                ref={searchInputRef}
                type="text"
                placeholder={t('search_placeholder')}
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const scannedValue = e.currentTarget.value.trim().replace(/\s+/g, '');
                    const normalizedScanValue = convertBengaliToEnglishNumerals(scannedValue);
                    const matchedProduct = barcodeMap.get(normalizedScanValue);
                    if (matchedProduct) {
                      if (externalProducts) onProductSelect?.(matchedProduct);
                      else addItem(matchedProduct, 1);
                      e.currentTarget.value = '';
                      if (externalProducts) setLocalSearchQuery('');
                      else setSearchQuery('');
                      e.currentTarget.focus();
                    }
                  }
                }}
                className="pl-8 sm:pl-9 pr-8 sm:pr-9 h-9 sm:h-11 touch-manipulation rounded-lg sm:rounded-xl shadow-xs transition-shadow focus-visible:ring-primary/20 text-sm"
                aria-label="Search products"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={clearSearch}
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
            {showCameraScan && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsCameraScannerOpen(true)}
                className="h-9 w-9 sm:h-11 sm:w-auto shrink-0 p-0 sm:px-3 md:hidden touch-manipulation"
                title={t('scan_barcode_title')}
              >
                <Camera className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('scan')}</span>
              </Button>
            )}
          </div>

          {showCategories && storeCategories.length > 0 && (
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-1.5 sm:gap-2 pb-1 sm:pb-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "cursor-pointer touch-manipulation transition-all px-2 sm:px-3 py-0.5 sm:py-1 text-[11px] sm:text-xs",
                    selectedCategoryId === null ? "shadow-sm bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20" : "hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 border-border/50 bg-background"
                  )}
                  onClick={() => handleCategorySelect(null)}
                >
                  {tc('all')}
                </Badge>
                {storeCategories.map((category) => (
                  <Badge
                    key={category}
                    variant="outline"
                    className={cn(
                      "cursor-pointer touch-manipulation transition-all px-2 sm:px-3 py-0.5 sm:py-1 text-[11px] sm:text-xs",
                      selectedCategoryId === category ? "shadow-sm bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20" : "hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 border-border/50 bg-background"
                    )}
                    onClick={() => handleCategorySelect(category)}
                  >
                    {category}
                  </Badge>
                ))}
              </div>
            </ScrollArea>
          )}

          {showCategories && selectedCategoryId && currentSubCategories.length > 0 && (
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-1.5 sm:gap-2 pb-1 sm:pb-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "cursor-pointer touch-manipulation transition-all px-2 sm:px-3 py-0.5 sm:py-1 text-[11px] sm:text-xs",
                    selectedSubCategoryId === null ? "shadow-sm bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/20" : "hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-purple-600 dark:hover:text-purple-400 border-border/50 bg-background"
                  )}
                  onClick={() => handleSubCategorySelect(null)}
                >
                  {tc('all')}
                </Badge>
                {currentSubCategories.map((subCategory) => (
                  <Badge
                    key={subCategory}
                    variant="outline"
                    className={cn(
                      "cursor-pointer touch-manipulation transition-all px-2 sm:px-3 py-0.5 sm:py-1 text-[11px] sm:text-xs",
                      selectedSubCategoryId === subCategory ? "shadow-sm bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/20" : "hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-purple-600 dark:hover:text-purple-400 border-border/50 bg-background"
                    )}
                    onClick={() => handleSubCategorySelect(subCategory)}
                  >
                    {subCategory}
                  </Badge>
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              {(searchQuery || selectedCategoryId || selectedSubCategoryId) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-6 sm:h-7 text-[11px] sm:text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 px-1.5"
                >
                  {t('clear_filters')}
                </Button>
              )}
              <span className="text-[11px] sm:text-xs font-medium text-muted-foreground bg-muted/50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md truncate">
                {t('product_count', { count: filteredProducts.length })}
              </span>
            </div>

            {showViewToggle && (
              <div className="flex items-center gap-0.5 bg-muted/30 border border-border/50 rounded-lg p-0.5 sm:p-1 shadow-xs shrink-0">
                <Button
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn("h-6 w-6 sm:h-7 sm:w-7 p-0 rounded-md transition-all", viewMode === 'grid' && "shadow-sm bg-background")}
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                >
                  <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </Button>
                <Button
                  variant={viewMode === 'compact' ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn("h-6 w-6 sm:h-7 sm:w-7 p-0 rounded-md transition-all", viewMode === 'compact' && "shadow-sm bg-background")}
                  onClick={() => setViewMode('compact')}
                  aria-label="Compact view"
                >
                  <Grid3X3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-2 sm:p-4 md:p-5">
          {(isStoreLoading || (!externalProducts && lastUpdated === null)) && filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 sm:py-16 text-center bg-card rounded-xl sm:rounded-2xl border border-dashed border-border/60">
              <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 text-primary animate-spin mb-3" />
              <p className="text-base sm:text-lg font-medium text-muted-foreground">{tc('loading')}</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 sm:py-16 text-center bg-card rounded-xl sm:rounded-2xl border border-dashed border-border/60">
              <Package className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mb-3" />
              <p className="text-base sm:text-lg font-medium text-muted-foreground">{t('no_products')}</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t('try_adjusting')}</p>
              {(searchQuery || selectedCategoryId) && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3">
                  {t('clear_all_filters')}
                </Button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
              {filteredProducts.slice(0, renderLimit).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-6">
              {Object.entries(productsByCategory).map(([category, categoryProducts]) => (
                <div key={category}>
                  <h3 className="font-semibold text-xs sm:text-sm text-muted-foreground mb-1.5 sm:mb-3 sticky top-0 bg-background/95 backdrop-blur-sm py-1 z-[1]">
                    {category} ({categoryProducts.length})
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-2">
                    {categoryProducts.map((product) => (
                      <CompactProductCard key={product.id} product={product} onSelect={onProductSelect} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!externalProducts && hasMore && !searchQuery && !selectedCategoryId && !selectedSubCategoryId && (
            <div ref={observerTarget} className="flex justify-center mt-4 sm:mt-6 mb-3">
              <Button variant="outline" size="sm" onClick={loadMoreProducts} disabled={isLoadingMore} className="h-9">
                {isLoadingMore ? tc('loading') : t('load_more')}
              </Button>
            </div>
          )}
        </div>
      </div>

      <CameraScannerDialog
        open={isCameraScannerOpen}
        onOpenChange={(open) => { setIsCameraScannerOpen(open); if (!open) setCameraScanError(null); }}
        onBarcodeScanned={handleCameraBarcode}
        title="Scan Barcode"
        description="Position barcode/QR code in the center of the frame"
        liveExternalError={cameraScanError}
      />
    </div>
  );
}

interface CompactProductCardProps {
  product: Product;
  onSelect?: (product: Product) => void;
}

function CompactProductCard({ product, onSelect }: CompactProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const locale = useLocale();
  const isOutOfStock = product.currentStock <= 0;

  const handleClick = () => {
    if (onSelect) onSelect(product);
    else addItem(product, 1);
  };

  const { formatPrice } = useNumberFormat();
  
  const isBn = locale === 'bn';
  const displayName = isBn ? (product.nameBn || product.name) : (product.name || product.nameBn);

  return (
    <button
      onClick={handleClick}
      className={cn(
        'flex flex-col items-center justify-center p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl border border-border/50 bg-card text-center shadow-xs',
        'lg:hover:bg-primary/5 lg:hover:border-primary/20 lg:hover:shadow-md lg:hover:-translate-y-0.5 transition-all duration-200',
        'focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1',
        'touch-manipulation min-h-16 sm:min-h-22.5 active:scale-[0.98]',
        isOutOfStock && 'border-red-200/50 dark:border-red-900/30'
      )}
      aria-label={`${displayName}, ${formatPrice(product.sellingPrice)}`}
    >
      <span className="text-[10px] sm:text-[11px] font-medium line-clamp-2 mb-0.5 sm:mb-1.5 leading-tight">{displayName}</span>
      <span className="text-xs sm:text-sm font-bold text-primary tracking-tight tabular-nums">{formatPrice(product.sellingPrice)}</span>
      {isOutOfStock && <span className="text-[8px] sm:text-[9px] text-destructive uppercase font-bold mt-0.5 tracking-wider">Out</span>}
    </button>
  );
}

export default ProductGrid;
