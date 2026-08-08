import { useEffect } from 'react';
import { useProductsStore, useSyncStore, useQuantityUsageStore } from '@/stores/pos-store';
import { ProductsDB } from '@/lib/offline/indexeddb';
import { refreshProductsFromServer } from '@/lib/products-sync';

export function usePosProducts(activeUser: any) {
  // Load products on mount (paginated — allow longer than a single request)
  useEffect(() => {
    if (activeUser?.requiresPasswordChange) return;

    let cancelled = false;
    const controller = new AbortController();
    // Full catalog can take multiple pages; 8s was aborting mid-load in dev/slow nets
    const timeoutId = window.setTimeout(() => {
      controller.abort(new DOMException('Products load timed out', 'TimeoutError'));
    }, 45_000);

    const isTimeoutAbort = () => {
      const reason = controller.signal.reason;
      return (
        (reason instanceof DOMException && reason.name === 'TimeoutError') ||
        (typeof reason === 'object' &&
          reason !== null &&
          'name' in reason &&
          (reason as { name?: string }).name === 'TimeoutError')
      );
    };

    const loadFromCache = async () => {
      try {
        const cachedProducts = await ProductsDB.getAll();
        if (!cancelled && cachedProducts.length > 0) {
          useProductsStore.getState().setProducts(cachedProducts);
        } else if (!cancelled) {
          console.warn('No cached products available');
        }
      } catch (dbError) {
        if (!cancelled) console.error('Failed to load products from cache:', dbError);
      }
    };

    const loadProducts = async () => {
      const { setProducts, setLoading } = useProductsStore.getState();
      const setOnline = useSyncStore.getState().setOnline;
      
      // Only show loader if we don't have products already loaded from cache
      if (useProductsStore.getState().products.length === 0) {
        setLoading(true);
      }
      try {
        const { fetchAllProductsFromApi, isAbortError } = await import('@/lib/fetch-all-products');
        const { products, ok, error, aborted } = await fetchAllProductsFromApi({
          pageSize: 250,
          signal: controller.signal,
        });

        // Effect cleaned up (Strict Mode remount / navigate away) — ignore result
        if (cancelled) return;

        if (ok && products.length > 0) {
          setProducts(products as never[], false, null);
          await ProductsDB.upsertMany(products as never[]);
          if (!cancelled) setOnline(true);
          return;
        }

        if (products.length > 0) {
          // Partial catalog still usable (timeout mid-pagination)
          setProducts(products as never[], false, null);
          await ProductsDB.upsertMany(products as never[]);
          if (!cancelled) {
            setOnline(true);
            if (aborted) {
              console.warn('Products load interrupted; using partial catalog:', products.length);
            }
          }
          return;
        }

        if (aborted || isAbortError(error)) {
          if (isTimeoutAbort()) {
            console.warn('Products load timed out; falling back to cache');
          }
          // Unmount cancel: cancelled=true already returned above
        } else {
          console.warn('Products API failed:', error);
        }

        if (cancelled) return;
        setOnline(false);
        await loadFromCache();
      } catch (error) {
        if (cancelled) return;

        const { isAbortError } = await import('@/lib/fetch-all-products');
        if (isAbortError(error)) {
          if (isTimeoutAbort()) {
            console.warn('Products load timed out; falling back to cache');
            useSyncStore.getState().setOnline(false);
            await loadFromCache();
          }
          return;
        }

        console.error(
          'Failed to load products from API:',
          error instanceof Error ? error.message : String(error),
        );
        useSyncStore.getState().setOnline(false);
        await loadFromCache();
      } finally {
        if (!cancelled) {
          useProductsStore.getState().setLoading(false);
        }
      }
    };

    // Start loading from cache immediately for fast offline-first display
    loadFromCache().then(() => {
      // After initiating cache load, fetch from API in the background
      loadProducts();
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort(new DOMException('Products load cancelled', 'AbortError'));
    };
  }, [activeUser?.requiresPasswordChange]);

  // Load quantity suggestions on mount from last 30 days of sales
  useEffect(() => {
    if (activeUser?.requiresPasswordChange) return;
    const loadQuantitySuggestions = async () => {
      try {
        const res = await fetch('/api/products/quantity-suggestions');
        if (res.ok) {
          const { data } = await res.json();
          useQuantityUsageStore.getState().mergeUsage(data);
        }
      } catch (error) {
        console.error('Failed to load quantity suggestions:', error);
      }
    };
    loadQuantitySuggestions();
  }, [activeUser?.requiresPasswordChange]);

  // Refresh products when tab becomes visible or after offline sync completes
  useEffect(() => {
    if (activeUser?.requiresPasswordChange) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        refreshProductsFromServer().catch(console.error);
      }
    };

    const handleSyncComplete = () => {
      if (navigator.onLine) {
        refreshProductsFromServer().catch(console.error);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('offlineSyncComplete', handleSyncComplete);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        refreshProductsFromServer().catch(console.error);
      }
    }, 60_000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('offlineSyncComplete', handleSyncComplete);
      window.clearInterval(intervalId);
    };
  }, [activeUser?.requiresPasswordChange]);
}
