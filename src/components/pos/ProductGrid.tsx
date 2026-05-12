'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, X, Grid3X3, LayoutGrid, Package, Camera } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { CameraScannerDialog } from './CameraScannerDialog';
import { Capacitor } from '@capacitor/core';
import type { Product } from '@/types/pos';
import { useProductsStore, useUIStore, useCartStore } from '@/stores/pos-store';
import { cn, convertBengaliToEnglishNumerals } from '@/lib/utils';

const cleanSearchQuery = (q: string) => q.replace(/rs\.?|₹/gi, '').trim();
import { useToast } from '@/hooks/use-toast';

type ViewMode = 'grid' | 'compact';

interface ProductGridProps {
  products?: Product[];
  onProductSelect?: (product: Product) => void;
  showSearch?: boolean;
  showCategories?: boolean;
  showViewToggle?: boolean;
}

export function ProductGrid({
  products: externalProducts,
  onProductSelect,
  showSearch = true,
  showCategories = true,
  showViewToggle = true,
}: ProductGridProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [cameraScanError, setCameraScanError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const storeProducts = useProductsStore((state) => state.products);
  const storeCategories = useProductsStore((state) => state.categories);
  const hasMore = useProductsStore((state) => state.hasMore);
  const nextCursor = useProductsStore((state) => state.nextCursor);
  const appendProducts = useProductsStore((state) => state.appendProducts);
  const storeSearchQuery = useUIStore((state) => state.searchQuery);
  const selectedCategoryId = useUIStore((state) => state.selectedCategoryId);
  const setSearchQuery = useUIStore((state) => state.setSearchQuery);
  const setSelectedCategoryId = useUIStore((state) => state.setSelectedCategoryId);

  const isAndroidApp = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();

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

  // Filter products based on search and category
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (!product.isActive) return false;
      if (selectedCategoryId && product.category !== selectedCategoryId) return false;
      if (searchQuery) {
        const cleaned = cleanSearchQuery(searchQuery);
        const lowerQuery = cleaned.toLowerCase();
        const normalizedQuery = convertBengaliToEnglishNumerals(cleaned);
        return (
          product.name.toLowerCase().includes(lowerQuery) ||
          product.nameBn?.includes(cleaned) ||
          product.barcode?.includes(cleaned) ||
          convertBengaliToEnglishNumerals(product.barcode || '').includes(normalizedQuery) ||
          product.sellingPrice.toString() === normalizedQuery
        );
      }
      return true;
    });
  }, [products, searchQuery, selectedCategoryId]);

  // Group products by category for display
  const productsByCategory = useMemo(() => {
    const grouped: Record<string, Product[]> = {};
    filteredProducts.forEach((product) => {
      if (!grouped[product.category]) grouped[product.category] = [];
      grouped[product.category].push(product);
    });
    return grouped;
  }, [filteredProducts]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value;
      if (externalProducts) { setLocalSearchQuery(query); return; }
      // Store raw value — conversion only happens at barcode match time
      setSearchQuery(query);
    },
    [externalProducts, setSearchQuery]
  );

  const clearSearch = useCallback(() => {
    if (externalProducts) setLocalSearchQuery('');
    else setSearchQuery('');
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
        toast({ title: 'Scanned', description: matchedProduct.name });
        if (navigator?.vibrate) navigator.vibrate(50);
      } else {
        setCameraScanError(`আইটেম পাওয়া যায়নি: ${cleanedBarcode}`);
        if (externalProducts) setLocalSearchQuery(barcode);
        else setSearchQuery(barcode);
      }
    },
    [barcodeMap, externalProducts, onProductSelect, addItem, setSearchQuery, toast]
  );

  const handleCategorySelect = useCallback(
    (category: string | null) => {
      setSelectedCategoryId(category === selectedCategoryId ? null : category);
    },
    [selectedCategoryId, setSelectedCategoryId]
  );

  const clearFilters = useCallback(() => {
    clearSearch();
    setSelectedCategoryId(null);
  }, [clearSearch, setSelectedCategoryId]);

  const loadMoreProducts = useCallback(async () => {
    if (isLoadingMore || !hasMore || !nextCursor || externalProducts) return;
    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/products?limit=10000&cursor=${nextCursor}`);
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

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-background/50">
      {/* Search and Filter Controls */}
      {showSearch && (
        <div className="flex flex-col gap-3 p-4 border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-10 shadow-sm">
          <label htmlFor="product-search" className="sr-only">Search products</label>
          <div className="flex gap-2">
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                id="product-search"
                name="product-search"
                ref={searchInputRef}
                type="text"
                placeholder="Search products by name, barcode..."
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
                className="pl-9 pr-9 h-11 touch-manipulation rounded-xl shadow-xs transition-shadow focus-visible:ring-primary/20"
                aria-label="Search products"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 md:right-1 top-1/2 -translate-y-1/2 h-8 w-8 md:h-7 md:w-7 p-0"
                  onClick={clearSearch}
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            {isAndroidApp && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsCameraScannerOpen(true)}
                className="w-full md:w-auto md:hidden"
                title="Scan barcode with camera"
              >
                <Camera className="w-4 h-4 mr-2" />
                Scan
              </Button>
            )}
          </div>

          {showCategories && storeCategories.length > 0 && (
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-2 pb-2">
                <Badge
                  variant={selectedCategoryId === null ? 'default' : 'outline'}
                  className={cn(
                    "cursor-pointer touch-manipulation transition-all px-3 py-1 text-xs",
                    selectedCategoryId === null ? "shadow-md bg-primary" : "hover:bg-primary/10 hover:text-primary"
                  )}
                  onClick={() => handleCategorySelect(null)}
                >
                  All
                </Badge>
                {storeCategories.map((category) => (
                  <Badge
                    key={category}
                    variant={selectedCategoryId === category ? 'default' : 'outline'}
                    className={cn(
                      "cursor-pointer touch-manipulation transition-all px-3 py-1 text-xs",
                      selectedCategoryId === category ? "shadow-md bg-primary" : "hover:bg-primary/10 hover:text-primary border-border/50 bg-background"
                    )}
                    onClick={() => handleCategorySelect(category)}
                  >
                    {category}
                  </Badge>
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              {(searchQuery || selectedCategoryId) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  Clear filters
                </Button>
              )}
              <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
              </span>
            </div>

            {showViewToggle && (
              <div className="flex items-center gap-1 bg-muted/30 border border-border/50 rounded-lg p-1 shadow-xs">
                <Button
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn("h-7 w-7 p-0 rounded-md transition-all", viewMode === 'grid' && "shadow-sm bg-background")}
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === 'compact' ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn("h-7 w-7 p-0 rounded-md transition-all", viewMode === 'compact' && "shadow-sm bg-background")}
                  onClick={() => setViewMode('compact')}
                  aria-label="Compact view"
                >
                  <Grid3X3 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 md:p-5">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-card rounded-2xl border border-dashed border-border/60">
              <Package className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No products found</p>
              <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters</p>
              {(searchQuery || selectedCategoryId) && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">
                  Clear all filters
                </Button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(productsByCategory).map(([category, categoryProducts]) => (
                <div key={category}>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3 sticky top-0 bg-background py-1">
                    {category} ({categoryProducts.length})
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                    {categoryProducts.map((product) => (
                      <CompactProductCard key={product.id} product={product} onSelect={onProductSelect} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!externalProducts && hasMore && !searchQuery && !selectedCategoryId && (
            <div className="flex justify-center mt-6 mb-4">
              <Button variant="outline" onClick={loadMoreProducts} disabled={isLoadingMore}>
                {isLoadingMore ? 'Loading...' : 'Load More Products'}
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
  const isOutOfStock = product.currentStock <= 0;

  const handleClick = () => {
    if (!isOutOfStock) {
      if (onSelect) onSelect(product);
      else addItem(product, 1);
    }
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(price);

  return (
    <button
      onClick={handleClick}
      disabled={isOutOfStock}
      className={cn(
        'flex flex-col items-center justify-center p-2.5 rounded-xl border border-border/50 bg-card text-center shadow-xs',
        'lg:hover:bg-primary/5 lg:hover:border-primary/20 lg:hover:shadow-md lg:hover:-translate-y-0.5 transition-all duration-200',
        'focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1',
        'touch-manipulation min-h-22.5',
        isOutOfStock && 'opacity-50 grayscale cursor-not-allowed lg:hover:bg-card lg:hover:border-border/50 lg:hover:shadow-xs lg:hover:translate-y-0'
      )}
      aria-label={`${product.name}, ${formatPrice(product.sellingPrice)}`}
    >
      <span className="text-[11px] font-medium line-clamp-2 mb-1.5 leading-tight">{product.name}</span>
      <span className="text-sm font-bold text-primary tracking-tight">{formatPrice(product.sellingPrice)}</span>
      {isOutOfStock && <span className="text-[9px] text-destructive uppercase font-bold mt-1 tracking-wider">Out</span>}
    </button>
  );
}

export default ProductGrid;
