'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { useProductCRUD } from '@/hooks/useProductCRUD';
import { useTranslations, useLocale } from 'next-intl';
import type { Product as ProductType } from '@/types/pos';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/components/providers/ThemeProvider';
import { useLogout } from '@/hooks/use-logout';
import {
  ProductGrid,
  CartPanel,
  Dashboard,
  StockManagement,
  PartiesManagement,
  UsersManagement,
  TransactionHistory,
  Reports,
  AuditLogs,
  Expenses,
  ExpensesReport,
  ProductStatistics,
  SettingsManagement,
  NotificationBell,
  KeyboardShortcuts,
  DueCollection,
  PurchaseOrderManagement,
  SalesReport,
  PaymentReport,
  StockReport,
  DuesReport,
  ProductsReport,
  CategoriesReport,
  CustomersReport,
  SupplierReport,
  ProfitReport,
  ProductDialog,
} from '@/app/pos/lazy-pages';
import { type PageType, navItems, mobileBottomNavItems, MORE_MENU_PAGE_IDS } from '@/app/pos/nav-config';
import { AddStockDialog, type StockEntryData } from '@/components/pos/AddStockDialog';
import type { ProductFormData } from '@/components/pos/ProductDialog';
import { CameraScannerDialog } from '@/components/pos/CameraScannerDialog';
import { CheckoutDialog, type PaymentData } from '@/components/pos/CheckoutDialog';
import { PrintDialog } from '@/components/pos/PrintDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOfflineContext } from '@/lib/offline/offline-context';
import { getSyncWorker } from '@/lib/offline/sync-worker';
import { useUserRole } from '@/hooks/use-permissions';
import { readStoredSessionUser } from '@/lib/session-utils';
import {
  Wifi,
  WifiOff,
  ShoppingCart,
  Menu,
  Store,
  RefreshCw,
  Package,
  LayoutDashboard,
  FileText,
  Users,
  Settings,
  Search,
  X,
  ScanLine,
  UserCog,
  History,
  Banknote,
  IndianRupee,
  ClipboardList,
  ChevronRight,
  User,
  Languages,
  Sun,
  Moon,
  Truck,
} from 'lucide-react';
import { useCartStore, useProductsStore, useSyncStore, useUIStore, useCustomersStore, useSalesStore, useQuantityUsageStore } from '@/stores/pos-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useSimpleBarcodeScanner } from '@/hooks/use-barcode-scanner';
import { ProductsDB, SalesDB, SyncQueueDB, CustomersDB, saveSaleWithSyncQueue, updateProductsAndCustomerDue } from '@/lib/offline/indexeddb';
import { STORE_CONFIG } from '@/types/pos';
import type { Product, Sale, SyncQueueItem } from '@/types/pos';
import { cn } from '@/lib/utils';
import { refreshProductsFromServer } from '@/lib/products-sync';
import { convertBengaliToEnglishNumerals, convertEnglishToBengaliNumerals } from '@/lib/utils';
import { useNumberFormat } from '@/hooks/use-number-format';
import { toMoneyNumber } from '@/lib/money';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/hooks/use-toast';
import { generateInvoiceNumber } from '@/lib/invoice';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

export function POSDashboard() {
  const t = useTranslations('Navigation');
  const router = useRouter();
  const locale = useLocale();
  const { formatPrice } = useNumberFormat();
  const [currentPage, setCurrentPage] = useState<PageType>('billing');
  const [isDashboardMounted, setIsDashboardMounted] = useState(false);
  const [isStockMounted, setIsStockMounted] = useState(false);
  const [isPartiesMounted, setIsPartiesMounted] = useState(false);
  const [isDueCollectionMounted, setIsDueCollectionMounted] = useState(false);
  const [isPurchaseOrdersMounted, setIsPurchaseOrdersMounted] = useState(false);
  const [isReportsMounted, setIsReportsMounted] = useState(false);
  const [isExpensesMounted, setIsExpensesMounted] = useState(false);
  const [isSettingsMounted, setIsSettingsMounted] = useState(false);
  const [isTransactionsPageMounted, setIsTransactionsPageMounted] = useState(false);
  const [isAuditPageMounted, setIsAuditPageMounted] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [searchFocusKey, setSearchFocusKey] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  // isProcessingPayment is now per-tab via UIStore

  const { theme, resolvedTheme, setTheme } = useTheme();
  const logout = useLogout();
  
  const toggleLanguage = useCallback(() => {
    const { settings, updateSetting } = useSettingsStore.getState();
    updateSetting('app_language', settings.app_language === 'bn' ? 'en' : 'bn');
  }, []);
  
  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  // Auth
  const { data: session, status: authStatus } = useSession();
  const userRole = useUserRole();

  // Offline context - USE THIS INSTEAD OF SYNC STORE for isOnline
  const { isOnline: isOnlineContext, networkStatus } = useOfflineContext();
  const [isOnline, setIsOnline] = useState(isOnlineContext);

  useEffect(() => {
    setIsOnline(isOnlineContext);
  }, [isOnlineContext]);

  useEffect(() => {
    if (currentPage === 'dashboard' && !isDashboardMounted) setIsDashboardMounted(true);
    if (currentPage === 'stock' && !isStockMounted) setIsStockMounted(true);
    if (currentPage === 'parties' && !isPartiesMounted) setIsPartiesMounted(true);
    if (currentPage === 'due-collection' && !isDueCollectionMounted) setIsDueCollectionMounted(true);
    if (currentPage === 'purchase-orders' && !isPurchaseOrdersMounted) setIsPurchaseOrdersMounted(true);
    if (currentPage === 'reports' && !isReportsMounted) setIsReportsMounted(true);
    if (currentPage === 'expenses' && !isExpensesMounted) setIsExpensesMounted(true);
    if (currentPage === 'settings' && !isSettingsMounted) setIsSettingsMounted(true);
    if (currentPage === 'transactions' && !isTransactionsPageMounted) setIsTransactionsPageMounted(true);
    if (currentPage === 'audit' && !isAuditPageMounted) setIsAuditPageMounted(true);
  }, [
    currentPage,
    isDashboardMounted,
    isStockMounted,
    isPartiesMounted,
    isDueCollectionMounted,
    isPurchaseOrdersMounted,
    isReportsMounted,
    isExpensesMounted,
    isSettingsMounted,
    isTransactionsPageMounted,
    isAuditPageMounted,
  ]);

  // Bump refresh key each time the dashboard or parties page becomes active
  const prevPageRef = useRef<string>('');
  useEffect(() => {
    if (currentPage === 'dashboard' && prevPageRef.current !== 'dashboard') {
      setDashboardRefreshKey((k) => k + 1);
    }
    if (currentPage === 'parties' && prevPageRef.current !== 'parties') {
      setPartiesRefreshKey((k) => k + 1);
    }
    prevPageRef.current = currentPage;
  }, [currentPage]);

  // Settings store
  const { settings } = useSettingsStore();
  const storeName = settings?.store_name || STORE_CONFIG.name;
  const storeNameBn = settings?.store_name_bn || STORE_CONFIG.nameBn;
  const [isAddStockOpen, setIsAddStockOpen] = useState(false);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [completedCheckoutSale, setCompletedCheckoutSale] = useState<Sale | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const activeUser = useMemo(() => {
    return session?.user || readStoredSessionUser();
  }, [session]);

  // Redirect to login if unauthenticated and online, or offline with no cached session
  useEffect(() => {
    if (isHydrated && authStatus === 'unauthenticated') {
      const storedUser = readStoredSessionUser();
      const isActuallyOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (!isActuallyOffline || !storedUser) {
        router.push('/login');
      }
    }
  }, [authStatus, isHydrated, router]);
  const [isMobileScannerOpen, setIsMobileScannerOpen] = useState(false);
  const [scannedItems, setScannedItems] = useState<{ name: string; qty: number }[]>([]);
  const [liveScanError, setLiveScanError] = useState<string | null>(null);
  const [mobileSearchQuery, setMobileSearchQuery] = useState('');
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [partiesRefreshKey, setPartiesRefreshKey] = useState(0);

  // Store hooks
  const products = useProductsStore((state) => state.products);
  const setProducts = useProductsStore((state) => state.setProducts);
  const isLoading = useProductsStore((state) => state.isLoading);
  const setLoading = useProductsStore((state) => state.setLoading);
  const getProductByBarcode = useProductsStore((state) => state.getProductByBarcode);
  const updateProductStock = useProductsStore((state) => state.updateProductStock);
  const updateProduct = useProductsStore((state) => state.updateProduct);
  const addProduct = useProductsStore((state) => state.addProduct);

  const customers = useCustomersStore((state) => state.customers);
  const updateCustomerDue = useCustomersStore((state) => state.updateCustomerDue);
  const setCustomers = useCustomersStore((state) => state.setCustomers);
  const setCustomersLoading = useCustomersStore((state) => state.setLoading);

  const { toast } = useToast();

  const addItem = useCartStore((state) => state.addItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const setLastScannedBarcode = useCartStore((state) => state.setLastScannedBarcode);
  const cartItems = useCartStore((state) => state.tabs.find(t => t.id === state.activeTabId)?.items ?? state.tabs[0].items);

  const cartItemCount = useMemo(() => {
    return cartItems.length;
  }, [cartItems]);

  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.totalPrice, 0);
  }, [cartItems]);

  const handleSearchFocus = useCallback(() => {
    setSearchFocusKey((k) => k + 1);
  }, []);

  const handleNewBill = useCallback(() => {
    clearCart();
  }, [clearCart]);

  // Removed isOnline from useSyncStore - now using useOfflineContext above
  const setOnline = useSyncStore((state) => state.setOnline);
  const isSyncing = useSyncStore((state) => state.isSyncing);
  const pendingCount = useSyncStore((state) => state.pendingCount);
  const setSyncing = useSyncStore((state) => state.setSyncing);
  const setPendingCount = useSyncStore((state) => state.setPendingCount);

  const isCheckoutOpen = useUIStore((state) => state.isCheckoutOpen);
  const setCheckoutOpen = useUIStore((state) => state.setCheckoutOpen);
  const isPrintDialogOpen = useUIStore((state) => state.isPrintDialogOpen);
  const setPrintDialogOpen = useUIStore((state) => state.setPrintDialogOpen);
  const currentSale = useUIStore((state) => state.currentSale);
  const setCurrentSale = useUIStore((state) => state.setCurrentSale);
  const setTabProcessing = useUIStore((state) => state.setTabProcessing);
  const processingTabIds = useUIStore((state) => state.processingTabIds);
  const activeTabId = useCartStore((state) => state.activeTabId);
  const isProcessingPayment = processingTabIds.has(activeTabId);


  // Filter nav items based on user role
  const filteredNavItems = useMemo(() => {
    if (authStatus === 'loading') {
      return navItems;
    }

    if (userRole === 'ADMIN') {
      return navItems;
    } else if (userRole === 'MANAGER') {
      return navItems.filter(item => item.id !== 'users' && item.id !== 'settings' && item.id !== 'audit');
    } else if (userRole === 'CASHIER') {
      return navItems.filter(item =>
        item.id === 'dashboard' ||
        item.id === 'billing' ||
        item.id === 'parties' ||
        item.id === 'transactions' ||
        item.id === 'due-collection'
      );
    } else {
      // VIEWER or unknown
      return navItems.filter(item =>
        item.id === 'dashboard' ||
        item.id === 'reports' ||
        item.id === 'transactions'
      );
    }
  }, [userRole, authStatus]);

  const filteredMoreMenuItems = useMemo(() => {
    // Exclude pages that are direct bottom-nav items — they should not appear in 'More'
    const directNavIds = new Set(['dashboard', 'billing', 'stock', 'transactions']);
    return filteredNavItems.filter(item => !directNavIds.has(item.id));
  }, [filteredNavItems]);

  // Mobile product search - server-side with offline fallback
  const [mobileSearchResults, setMobileSearchResults] = useState<ProductType[]>([]);
  const [isMobileSearching, setIsMobileSearching] = useState(false);

  const handleMobileSearchChange = useCallback((query: string) => {
    setMobileSearchQuery(query);
    
    if (!query.trim()) {
      setMobileSearchResults([]);
      return;
    }
    
    const cleaned = query.replace(/rs\.?|₹|৳|'/gi, '').trim();
    const lowerQuery = cleaned.toLowerCase();
    const normalizedQuery = convertBengaliToEnglishNumerals(cleaned).replace(/\s+/g, '');
    
    const results = products.filter(p => {
      if (!p.isActive) return false;
      return (
        p.name.toLowerCase().replace(/'/g, '').includes(lowerQuery) ||
        (p.nameBn && p.nameBn.replace(/'/g, '').includes(cleaned)) ||
        (p.barcode && p.barcode.includes(normalizedQuery)) ||
        convertBengaliToEnglishNumerals(p.barcode || '').includes(normalizedQuery)
      );
    });
    
    setMobileSearchResults(results);
  }, [products]);

  // ✅ HYDRATION TRACKING: Prevent SSR/client mismatch
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Mobile virtual keyboard detection via visualViewport API
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const THRESHOLD = 150; // px — keyboard আসলে viewport ছোট হয়
    const initialHeight = vv.height;

    const handleResize = () => {
      const diff = initialHeight - vv.height;
      setIsKeyboardOpen(diff > THRESHOLD);
    };

    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
  }, []);

  // Load customers on mount
  useEffect(() => {
    if (activeUser?.requiresPasswordChange) return;
    const loadCustomers = async () => {
      const { setCustomers, setLoading: setCustomersLoading } = useCustomersStore.getState();
      setCustomersLoading(true);
      try {
        // First load from IndexedDB for instant search
        const cachedCustomers = await CustomersDB.getAll();
        if (cachedCustomers.length > 0) {
          setCustomers(cachedCustomers);
          setCustomersLoading(false);
        }

        // Then fetch from API to update
        const res = await fetch('/api/customers');
        if (res.ok) {
          const { data } = await res.json();
          setCustomers(data);
          // Update IndexedDB with fresh data
          await CustomersDB.upsertMany(data);
        }
      } catch {
        // If API fails, keep cached data
        if (customers.length === 0) {
          const cachedCustomers = await CustomersDB.getAll();
          setCustomers(cachedCustomers);
        }
      } finally {
        setCustomersLoading(false);
      }
    };
    loadCustomers();
  }, [customers.length, activeUser?.requiresPasswordChange]);

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

      setLoading(true);
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

    loadProducts();

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

  // Monitor online status - check both navigator.onLine AND actual API connectivity
  useEffect(() => {
    const checkConnectivity = async () => {
      const setOnline = useSyncStore.getState().setOnline;

      // First check navigator.onLine
      if (!navigator.onLine) {
        setOnline(false);
        return;
      }

      // Try to verify connection by testing a simple API call
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        try {
          const response = await fetch('/api/auth/session', {
            method: 'GET',
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            setOnline(true);
          } else {
            setOnline(false);
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          throw fetchErr;
        }
      } catch (error) {
        setOnline(false);
      }
    };

    // Check on mount
    checkConnectivity();

    // Check periodically (every 5 minutes — reduced to avoid background load)
    const interval = setInterval(checkConnectivity, 300000);

    // Listen to navigator online/offline events
    const handleOnline = () => checkConnectivity();
    const handleOffline = () => {
      useSyncStore.getState().setOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Barcode scanner handler
  const lastScannedRef = useRef<{ barcode: string; time: number }>({ barcode: '', time: 0 });

  const handleBarcodeDetected = useCallback(
    (barcode: string) => {
      const cleanedBarcode = barcode.replace(/\s+/g, '');
      const now = Date.now();

      // Debounce logic: prevent the same barcode from being scanned multiple times within 1000ms
      if (lastScannedRef.current.barcode === cleanedBarcode && now - lastScannedRef.current.time < 1000) {
        return;
      }

      lastScannedRef.current = { barcode: cleanedBarcode, time: now };
      const product = getProductByBarcode(cleanedBarcode);
      if (product) {
        setLiveScanError(null);
        addItem(product, 1);
        setLastScannedBarcode(barcode);
        if (isMobileScannerOpen) {
          setScannedItems(prev => {
            const existing = prev.find(i => i.name === product.name);
            if (existing) return prev.map(i => i.name === product.name ? { ...i, qty: i.qty + 1 } : i);
            return [{ name: product.name, qty: 1 }, ...prev];
          });
        }
        if (currentPage !== 'billing') setCurrentPage('billing');
      } else {
        setLiveScanError(`আইটেম পাওয়া যায়নি: ${cleanedBarcode}`);
        if (!isMobileScannerOpen) {
          toast({ title: 'Product Not Found', description: `Barcode ${cleanedBarcode} not found.`, variant: 'destructive' });
        }
      }
    },
    [getProductByBarcode, addItem, setLastScannedBarcode, currentPage, isMobileScannerOpen]
  );

  const handleOpenMobileScanner = useCallback(() => {
    setIsMobileScannerOpen(true);
  }, []);

  // Initialize barcode scanner
  // It should be disabled when any major dialog is open that might interfere or consume input
  const isAnyDialogOpen = isCheckoutOpen || isAddStockOpen || isProductDialogOpen || isPrintDialogOpen;

  useSimpleBarcodeScanner({
    onBarcodeDetected: handleBarcodeDetected,
    enabled: !isAnyDialogOpen,
  });

  // Android back button handler
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let backPressedOnce = false;
    let backPressTimer: ReturnType<typeof setTimeout>;

    const handler = CapacitorApp.addListener('backButton', () => {
      // 1. কোনো dialog / sheet খোলা থাকলে বন্ধ করো
      if (isCheckoutOpen) { setCheckoutOpen(false); return; }
      if (isAddStockOpen) { setIsAddStockOpen(false); return; }
      if (isProductDialogOpen) { setIsProductDialogOpen(false); return; }
      if (isPrintDialogOpen) { setPrintDialogOpen(false); return; }
      if (isMobileScannerOpen) { setIsMobileScannerOpen(false); return; }
      if (moreMenuOpen) { setMoreMenuOpen(false); return; }
      if (mobileCartOpen) { setMobileCartOpen(false); return; }

      // 2. billing ছাড়া অন্য পেজে থাকলে billing-এ ফিরে যাও
      if (currentPage !== 'billing') {
        setCurrentPage('billing');
        return;
      }

      // 3. billing-এ থাকলে দু'বার back চাপলে exit
      if (backPressedOnce) {
        clearTimeout(backPressTimer);
        CapacitorApp.exitApp();
        return;
      }

      backPressedOnce = true;
      toast({ title: 'আবার Back চাপুন বন্ধ করতে' });
      backPressTimer = setTimeout(() => { backPressedOnce = false; }, 2000);
    });

    return () => {
      clearTimeout(backPressTimer);
      handler.then(h => h.remove());
    };
  }, [currentPage, isCheckoutOpen, isAddStockOpen, isProductDialogOpen, isPrintDialogOpen, isMobileScannerOpen, moreMenuOpen, mobileCartOpen, setCheckoutOpen, setPrintDialogOpen, toast]);

  // Handle checkout completion

  const processOfflineSale = useCallback(async (paymentData: PaymentData) => {
    let paymentStatus = 'Paid';
    if (toMoneyNumber(paymentData.amountPaid) === 0) paymentStatus = 'Due';
    else if (toMoneyNumber(paymentData.amountPaid) > 0 && toMoneyNumber(paymentData.amountPaid) < toMoneyNumber(paymentData.total)) paymentStatus = 'Partial';

    const sale: Sale = {
      id: uuidv4(),
      invoiceNumber: generateInvoiceNumber(),
      customerId: paymentData.customerId,
      userId: (activeUser as { id?: string })?.id,
      user: activeUser ? {
        id: (activeUser as any).id || '',
        name: activeUser.name || (activeUser as any).username || '',
        username: (activeUser as any).username || '',
      } : undefined,
      subtotal: cartItems.reduce((s, it) => s + it.totalPrice, 0),
      discount: paymentData.discount,
      tax: paymentData.tax,
      totalAmount: paymentData.total,
      amountPaid: paymentData.amountPaid,
      paymentMethod: paymentData.paymentMethod,
      cashAmount: paymentData.cashAmount,
      upiAmount: paymentData.upiAmount,
      paymentStatus: paymentStatus as 'Paid' | 'Partial' | 'Due',
      status: 'Completed',
      notes: undefined,
      offlineSynced: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: cartItems.map(item => ({
        id: uuidv4(),
        saleId: '',
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        unit: item.unit,
        createdAt: new Date(),
      })),
    } as Sale;

    // ২. ক্লাউড এপিআই-এর জন্য একদম সঠিক কাঠামোর পেলোড তৈরি (The Critical Fix)
    const backendSyncPayload = {
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      userId: sale.userId,
      subtotal: cartItems.reduce((s, it) => s + it.totalPrice, 0),
      totalAmount: paymentData.total,
      items: cartItems.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      })),
      customerId: paymentData.customerId,
      paymentMethod: paymentData.paymentMethod,
      amountPaid: paymentData.amountPaid,
      paymentStatus: paymentStatus,
      amountReceived: paymentData.amountReceived ?? (paymentData.cashAmount ?? 0) + (paymentData.upiAmount ?? 0),
      cashAmount: paymentData.cashAmount,
      upiAmount: paymentData.upiAmount,
      discount: paymentData.discount,
      tax: paymentData.tax,
      usePrepaid: paymentData.usePrepaid,
      prepaidAmountUsed: paymentData.prepaidAmountUsed,
      changeAsPrepayment: paymentData.changeAsPrepayment || 0,
      debtRepaymentAmount: paymentData.debtRepaymentAmount || 0,
      offlineSaleId: sale.id, // ট্র্যাকিংয়ের জন্য
    };

    // Create sync queue items - prepare BOTH sale and prepayment before saving
    const syncQueueItem: SyncQueueItem = {
      id: uuidv4(),
      entityType: 'Sale',
      entityId: sale.id,
      action: 'create',
      payload: JSON.stringify(backendSyncPayload),
      synced: false,
      retryCount: 0,
      createdAt: new Date(),
    };

    // Prepare prepayment queue item if applicable
    const prepaymentQueueItem = (paymentData.changeAsPrepayment && paymentData.changeAsPrepayment > 0 && paymentData.customerId) 
      ? {
          id: uuidv4(),
          entityType: 'Prepayment',
          entityId: uuidv4(),
          action: 'create',
          payload: JSON.stringify({ customerId: paymentData.customerId, amount: paymentData.changeAsPrepayment }),
          synced: false,
          retryCount: 0,
          createdAt: new Date(),
        } as SyncQueueItem
      : null;

    // ✅ FIX: Atomize transaction - save sale and prepayment together
    try {
      await saveSaleWithSyncQueue(sale, syncQueueItem);
      
      // Only save prepayment if main sale succeeded
      if (prepaymentQueueItem) {
        await SyncQueueDB.add(prepaymentQueueItem);
      }
    } catch (error) {
      console.error('Failed to save sale with sync queue:', error);
      throw error;
    }

    cartItems.forEach((item) => {
      updateProductStock(item.productId, -item.quantity);
      ProductsDB.updateStock(item.productId, -item.quantity).catch(console.error);
    });

    if (paymentData.customerId) {
      const dueAmount = paymentData.total - paymentData.amountPaid;
      if (dueAmount > 0) {
        updateCustomerDue(paymentData.customerId, dueAmount);
        CustomersDB.updateDue(paymentData.customerId, dueAmount).catch(console.error);
      }
    }

    setCurrentSale(sale);
    setCompletedCheckoutSale(sale);
    clearCart();
    
    // Record quantities for dynamic shortcuts
    cartItems.forEach((item) => {
      useQuantityUsageStore.getState().recordQuantity(item.productId, item.quantity);
    });
    
    // ✅ Add sale to Zustand store so Dashboard & TransactionHistory update
    useSalesStore.setState({ sales: [sale, ...useSalesStore.getState().sales] });
    
    return sale; // Return sale so handleCheckoutComplete can use it
  }, [cartItems, activeUser, updateProductStock, updateCustomerDue, setCurrentSale, setCompletedCheckoutSale, clearCart]);

  const handleCheckoutComplete = useCallback(async (paymentData: PaymentData) => {
    const tabId = activeTabId;
    setTabProcessing(tabId, true);

    try {
      // ১. সব অবস্থাতেই প্রথমে লোকাল ডাটাবেস (IndexedDB) ও UI সাথে সাথে আপডেট করুন (Zero Latency)
      const sale = await processOfflineSale(paymentData);
      
      // Try to save sale to server database if online
      // ✅ CRITICAL FIX: Remove direct /api/sales call to prevent race conditions & duplicate syncs
      // Queue is already created in processOfflineSale - use background sync only
      
      // ২. ইউজারকে সাথে সাথে সাকসেস স্ক্রিন দেখিয়ে দিন, যাতে সে পরবর্তী বিলিং শুরু করতে পারে
      toast({ title: 'সফল', description: 'বিলিং সম্পন্ন হয়েছে।', duration: 1500 });

      // ৩. ব্যাকগ্রাউন্ডে ডাটাবেস সিঙ্ক ট্রিগার করুন (নেটওয়ার্ক থাকলে সিঙ্ক হবে, না থাকলে কিউতে জমা থাকবে)
      if (isOnline) {
        getSyncWorker().then(worker => worker.startSync()).catch(console.error);
      }
    } catch (error) {
      console.error('Checkout failed:', error);
      
      setCompletedCheckoutSale(null);
      setCheckoutOpen(false);
      
      toast({
        title: 'চেকআউট ব্যর্থ হয়েছে',
        description: error instanceof Error ? error.message : 'ত্রুটি হয়েছে',
        variant: 'destructive',
      });
    } finally {
      setTabProcessing(tabId, false);
    }
  }, [isOnline, processOfflineSale, activeTabId, setTabProcessing, toast, setCompletedCheckoutSale, setCheckoutOpen]);



  const handleOpenCheckout = useCallback(() => {
    setCheckoutOpen(true);
  }, [setCheckoutOpen]);

  const handleStockEntry = useCallback(async (data: StockEntryData) => {
    try {
      if (isOnline) {
        // Send stock entry to backend API
        const response = await fetch('/api/stock-entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: data.productId,
            quantity: data.quantity,
            purchasePrice: data.purchasePrice,
            date: data.date,
            supplierId: data.supplierId,
            amountPaid: data.amountPaid,
            notes: data.notes,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          const msg = response.status === 403
            ? 'আপনার স্টক যোগ করার অনুমতি নেই।'
            : response.status === 401
            ? 'আপনি লগইন করা নেই। পুনরায় লগইন করুন।'
            : errorData.error;
          console.error('Stock entry failed:', msg);
          toast({ title: 'স্টক এন্ট্রি ব্যর্থ', description: msg, variant: 'destructive' });
          return;
        }

        const { data: updatedProduct } = await response.json();

        // ✅ FIX: Update local store with new stock from server response
        updateProductStock(data.productId, data.quantity);
        // Also update IndexedDB with the new product data
        await ProductsDB.upsert(updatedProduct);

        const productName = products.find(p => p.id === data.productId)?.name ?? 'পণ্য';
        toast({ title: 'স্টক যোগ সফল', description: `"${productName}" এ ${data.quantity} যোগ হয়েছে।` });
      } else {
        // offline: update local store and queue sync
        updateProductStock(data.productId, data.quantity);
        ProductsDB.updateStock(data.productId, data.quantity).catch(console.error);
        await SyncQueueDB.add({
          id: uuidv4(),
          entityType: 'Product',
          entityId: data.productId,
          action: 'update',
          payload: JSON.stringify({ productId: data.productId, quantityChange: data.quantity, amountPaid: data.amountPaid, supplierId: data.supplierId, purchasePrice: data.purchasePrice }),
          synced: false,
          retryCount: 0,
          createdAt: new Date(),
        });
        setPendingCount(pendingCount + 1);
        toast({ title: 'Offline entry saved', description: 'Stock will sync when back online.' });
      }
    } catch (error) {
      console.error('Stock entry error:', error);
      toast({
        title: 'Stock entry error',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
    }
  }, [isOnline, updateProductStock, setProducts, pendingCount, toast, products]);

  // Handle product save
  const handleProductSave = useCallback(async (data: ProductFormData) => {
    try {
      const canReachServer = typeof navigator !== 'undefined' && navigator.onLine;
      if (!canReachServer) {
        // offline: store locally and queue a sync entry
        if (data.id) {
          const updatedProductData: Partial<Product> = {
            ...data,
            barcode: data.barcode || null,
            updatedAt: new Date(),
          };
          updateProduct(data.id, updatedProductData);

          // Get existing product to preserve createdAt if possible
          const existingProduct = products.find(p => p.id === data.id);
          const fullProduct: Product = {
            id: data.id,
            name: data.name,
            nameBn: data.nameBn,
            barcode: data.barcode || null,
            category: data.category,
            buyingPrice: data.buyingPrice,
            sellingPrice: data.sellingPrice,
            unit: data.unit,
            currentStock: data.currentStock,
            minStockLevel: data.minStockLevel,
            isActive: data.isActive,
            createdAt: existingProduct?.createdAt || new Date(),
            updatedAt: new Date(),
          };
          ProductsDB.upsert(fullProduct);

          await SyncQueueDB.add({
            id: uuidv4(),
            entityType: 'Product',
            entityId: data.id,
            action: 'update',
            payload: JSON.stringify(data),
            synced: false,
            retryCount: 0,
            createdAt: new Date(),
          });
        } else {
          const newProduct: Product = {
            ...data,
            id: uuidv4(),
            barcode: data.barcode || null,
            currentStock: 0,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          addProduct(newProduct);
          ProductsDB.upsert(newProduct);
          await SyncQueueDB.add({
            id: uuidv4(),
            entityType: 'Product',
            entityId: newProduct.id,
            action: 'create',
            payload: JSON.stringify(newProduct),
            synced: false,
            retryCount: 0,
            createdAt: new Date(),
          });
        }

        toast({ title: 'Offline product saved', description: 'Changes will sync when online.' });
        return;
      }

      if (data.id) {
        // Update existing product
        const response = await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          const msg = response.status === 403
            ? 'আপনার প্রডাক্ট এডিট করার অনুমতি নেই।'
            : response.status === 401
            ? 'আপনি লগইন করা নেই। পুনরায় লগইন করুন।'
            : errorData.error || 'Failed to update product';
          throw new Error(msg);
        }
        
        const { data: updatedProduct } = await response.json();
        updateProduct(updatedProduct.id, updatedProduct);
        // ✅ FIX: Persist updated product to IndexedDB for offline access
        await ProductsDB.upsert(updatedProduct);

      } else {
        // Add new product
        const response = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          const msg = response.status === 403
            ? 'আপনার নতুন প্রডাক্ট যোগ করার অনুমতি নেই।'
            : response.status === 401
            ? 'আপনি লগইন করা নেই। পুনরায় লগইন করুন।'
            : errorData.error || 'Failed to create product';
          throw new Error(msg);
        }

        const { data: newProduct } = await response.json();
        addProduct(newProduct);
        await ProductsDB.upsert(newProduct);
        toast({ title: 'প্রোডাক্ট যোগ হয়েছে', description: `"${newProduct.name}" ইনভেন্টরিতে যোগ করা হয়েছে।` });
        refreshProductsFromServer().catch(console.error);
        return newProduct;
      }

      toast({ title: 'প্রোডাক্ট সংরক্ষিত', description: 'পরিবর্তন সফলভাবে সংরক্ষণ হয়েছে।' });
      refreshProductsFromServer().catch(console.error);
    } catch (error) {
      console.error("Failed to save product:", error);
      toast({
        title: 'Product save error',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      });
    }
  }, [updateProduct, addProduct, toast, products]);

  // Handle navigation
  const handleNavigate = useCallback((page: string) => {
    if (page === 'scan') {
      handleOpenMobileScanner();
      return;
    }
    setCurrentPage(page as PageType);
  }, [handleOpenMobileScanner]);

  // Open add stock for specific product
  const handleAddStock = useCallback((product: Product) => {
    setSelectedProduct(product);
    setIsAddStockOpen(true);
  }, []);

  // Open edit product
  const handleEditProduct = useCallback((product: Product) => {
    setSelectedProduct(product);
    setIsProductDialogOpen(true);
  }, []);

  // Open add product
  const handleAddProduct = useCallback(() => {
    setSelectedProduct(null);
    setIsProductDialogOpen(true);
  }, []);

  // Delete product
  const removeProduct = useProductsStore((state) => state.removeProduct);
  const handleDeleteProduct = useCallback(async (product: Product) => {
    if (!confirm(`"${product.name}" ডিলিট করবেন? এটি আর বিলিং বা স্টকে দেখাবে না।`)) return;
    try {
      const res = await fetch(`/api/products?id=${product.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'Failed to delete');
      }
      removeProduct(product.id);
      toast({ title: 'ডিলিট সফল', description: `"${product.name}" সরিয়ে দেওয়া হয়েছে।` });
    } catch (error) {
      toast({ title: 'ডিলিট ব্যর্থ', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  }, [removeProduct, toast]);

  // Render sidebar navigation
  const renderSidebar = () => (
    <nav className="flex flex-col h-full bg-slate-50 dark:bg-slate-900/50">
      <div className="p-4 border-b bg-background/50 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shadow-sm shrink-0">
              <Store className="w-6 h-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-sm bg-linear-to-r from-primary to-primary/70 bg-clip-text text-transparent truncate">{storeName}</h1>
              <p className="text-xs text-muted-foreground truncate">{storeNameBn}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell variant="desktop" />
          </div>
        </div>
      </div>

      <div className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        {filteredNavItems.map((item, index) => (
          <motion.button
            key={item.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: index * 0.03, ease: 'easeOut' }}
            onClick={() => handleNavigate(item.id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 font-medium group',
              currentPage === item.id
                ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 shadow-sm shadow-blue-500/5 scale-[1.02]'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:scale-[1.01]'
            )}
          >
            <div className={cn(
              "transition-transform duration-200",
              currentPage === item.id ? "scale-110" : "group-hover:scale-110"
            )}>
              {item.icon}
            </div>
            <span className="font-medium tracking-tight text-sm truncate flex-1">{t(item.id as any)}</span>
            {currentPage === item.id && (
              <ChevronRight className="w-4 h-4 opacity-60" />
            )}
          </motion.button>
        ))}
      </div>

      {/* Desktop Toggles and Logout */}
      <div className="p-3 border-t bg-slate-100/50 dark:bg-slate-900/30 space-y-3">
        {activeUser && (
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold shrink-0 text-sm">
              {(activeUser.name || activeUser.email || 'U')[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate leading-none mb-1">{activeUser.name || activeUser.email}</p>
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 uppercase font-bold tracking-wider text-muted-foreground">
                {userRole}
              </Badge>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-1 px-1">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-slate-200 dark:hover:bg-slate-800"
              title="Toggle Theme"
            >
              {resolvedTheme === 'dark' ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleLanguage}
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-slate-200 dark:hover:bg-slate-800"
              title="Toggle Language"
            >
              <Languages className="h-4 w-4" />
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 gap-1.5"
          >
            <span className="text-xs font-semibold">{t('logout')}</span>
          </Button>
        </div>
      </div>

      <div className="p-4 border-t">
        <div className="flex items-center gap-2">
          <Badge
            variant={isOnline ? 'default' : 'secondary'}
            className={cn(
              isOnline ? 'bg-green-500 hover:bg-green-600' : 'bg-amber-500 hover:bg-amber-600'
            )}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3 h-3 mr-1" />
                Online
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 mr-1" />
                Offline
              </>
            )}
          </Badge>
          {isSyncing && (
            <Badge variant="outline" className="gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Syncing
            </Badge>
          )}
          {pendingCount > 0 && (
            <Badge variant="outline" className="text-amber-600">
              {pendingCount} pending
            </Badge>
          )}
        </div>
      </div>
    </nav>
  );

  // Render page content
  const renderPageContent = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={handleNavigate} refreshKey={dashboardRefreshKey} />;
      case 'billing':
        return (
          <div className="flex h-full">
            {/* Product Grid (desktop only) */}
            <div className="flex-1 hidden sm:flex flex-col overflow-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
                    <p className="text-muted-foreground">Loading products...</p>
                  </div>
                </div>
              ) : (
                <ProductGrid searchFocusKey={searchFocusKey} />
              )}
            </div>

            {/* Mobile billing: cart + scan button (no product list) */}
            <div className="flex-1 flex flex-col overflow-hidden w-full sm:hidden min-h-0">
              <div className="p-1.5 border-b bg-background">
                <div className="flex flex-row items-center gap-1.5 w-full">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search products by name or barcode..."
                      value={mobileSearchQuery}
                      onChange={(e) => handleMobileSearchChange(e.target.value)}
                      className="pl-9 h-8 text-sm"
                    />
                    {mobileSearchQuery && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 md:h-8 md:w-8 p-0"
                        onClick={() => { setMobileSearchQuery(''); setMobileSearchResults([]); }}
                        aria-label="Clear Search"
                      >
                        <X className="w-3 h-3 md:w-4 md:h-4" />
                      </Button>
                    )}
                  </div>
                  <Button size="sm" className="shrink-0 h-8 w-8 p-0" onClick={handleOpenMobileScanner} aria-label="Scan Barcode">
                    <ScanLine className="h-4 w-4 md:mr-2" />
                    <span className="hidden md:inline">Scan</span>
                  </Button>
                </div>
              </div>

              {/* Search Results */}
              {mobileSearchQuery && (
                <div className="border-b bg-background max-h-48 overflow-y-auto">
                  <div className="p-2">
                    <h3 className="text-xs font-medium mb-1.5">Search Results ({mobileSearchResults.length})</h3>
                    {isMobileSearching ? (
                      <p className="text-sm text-muted-foreground">Searching...</p>
                    ) : mobileSearchResults.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No products found</p>
                    ) : (
                      <div className="space-y-2">
                        {mobileSearchResults.slice(0, 15).map((product) => (
                          <div
                            key={product.id}
                            className="flex items-center justify-between p-1.5 rounded-lg border hover:bg-muted/50 cursor-pointer"
                            onClick={() => {
                              addItem(product, 1);
                              setMobileSearchQuery('');
                              setMobileSearchResults([]);
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{product.name}</p>
                              {product.barcode && (
                                <p className="text-xs text-muted-foreground">{product.barcode}</p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-sm">{formatPrice(product.sellingPrice)}</p>
                              {product.currentStock <= 0 && (
                                <p className="text-xs text-destructive">Out of stock</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex-1 min-h-0">
                <CartPanel onCheckout={handleOpenCheckout} customers={customers} onScan={handleOpenMobileScanner} />
              </div>
            </div>

            {/* Desktop Cart Panel */}
            <aside className="hidden sm:block w-96 border-l bg-card shrink-0">
              <CartPanel onCheckout={handleOpenCheckout} customers={customers} onScan={handleOpenMobileScanner} />
            </aside>
          </div>
        );
      case 'stock':
        return (
          <StockManagement
            onAddProduct={handleAddProduct}
            onEditProduct={handleEditProduct}
            onAddStock={handleAddStock}
            onDeleteProduct={handleDeleteProduct}
            onStatistics={() => setCurrentPage('stock-statistics')}
          />
        );
      case 'stock-statistics':
        return <ProductStatistics onBack={() => setCurrentPage('stock')} />;
      case 'parties':
        return <PartiesManagement refreshKey={partiesRefreshKey} />;
      case 'due-collection':
        return <DueCollection />;
      case 'purchase-orders':
        return <PurchaseOrderManagement />;
      case 'reports':
        return <Reports onNavigate={handleNavigate} />;
      case 'sales-report':
        return <SalesReport onBack={() => setCurrentPage('reports')} />;
      case 'payment-report':
        return <PaymentReport onBack={() => setCurrentPage('reports')} />;
      case 'stock-report':
        return <StockReport onBack={() => setCurrentPage('reports')} />;
      case 'dues-report':
        return <DuesReport onBack={() => setCurrentPage('reports')} onNavigate={handleNavigate} />;
      case 'products-report':
        return <ProductsReport onBack={() => setCurrentPage('reports')} />;
      case 'categories-report':
        return <CategoriesReport onBack={() => setCurrentPage('reports')} />;
      case 'customers-report':
        return <CustomersReport onBack={() => setCurrentPage('reports')} />;
      case 'supplier-report':
        return <SupplierReport onBack={() => setCurrentPage('reports')} />;
      case 'profit-report':
        return <ProfitReport onBack={() => setCurrentPage('reports')} />;

      case 'transactions':
        return null;
      case 'expenses':
        return <Expenses onReport={() => setCurrentPage('expenses-report')} />;
      case 'expenses-report':
        return <ExpensesReport onBack={() => setCurrentPage('expenses')} />;
      case 'audit':
        return null;
      case 'menu':
        return (
          <div className="p-4 overflow-y-auto h-full">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-2xl font-bold">Menu</h1>
              <Button size="sm" variant="outline" onClick={() => setCurrentPage('dashboard')}>
                Back
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {filteredNavItems
                .filter((item) => MORE_MENU_PAGE_IDS.includes(item.id as PageType))
                .map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setCurrentPage(item.id)}
                    className="flex flex-col items-center justify-center p-4 rounded-xl border bg-card hover:bg-primary/10 transition-colors gap-2"
                  >
                    {item.icon}
                    <span className="text-sm font-medium">{t(item.id as any)}</span>
                  </button>
                ))}
            </div>
          </div>
        );
      case 'users':
        return null;
      case 'settings':
        return <SettingsManagement />;
      default:
        return null;
    }
  };

  // ✅ HYDRATION GUARD: Prevent SSR/client mismatch by not rendering until hydrated
  if (!isHydrated) {
    return null;
  }

  return (
    <div className="h-dvh w-full overflow-hidden flex flex-col lg:flex-row bg-slate-100/50 dark:bg-background">
      <KeyboardShortcuts
        activePage={currentPage}
        setActivePage={setCurrentPage}
        onCheckout={handleOpenCheckout}
        onNewBill={handleNewBill}
        onSearch={handleSearchFocus}
        onAddProduct={handleAddProduct}
        onBarcodeScan={handleOpenMobileScanner}
      />
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 border-r border-border/50 bg-card shrink-0 no-print shadow-xs z-10 transition-all duration-300">
        {renderSidebar()}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {/* Mobile Header */}
        <header className="lg:hidden shrink-0 border-b border-border/50 bg-card/80 backdrop-blur-md px-2.5 py-1 pt-[calc(env(safe-area-inset-top)+0.25rem)] no-print sticky top-0 z-20">
          <div className="flex items-center justify-between gap-1.5 min-h-9">
            {/* Store Name */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shadow-sm shrink-0">
                <Store className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-xs bg-linear-to-r from-primary to-primary/70 bg-clip-text text-transparent truncate">{storeName}</h1>
                {currentPage !== 'billing' && (
                  <p className="text-[9px] text-muted-foreground truncate leading-none mt-0.5">
                    {currentPage === 'menu' ? 'Menu' : (navItems.find(n => n.id === currentPage)?.label ?? currentPage)}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-0 shrink-0">
              {!isOnline && (
                <Badge variant="secondary" className="text-[9px] h-5 px-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0 mr-0.5">
                  <WifiOff className="w-2.5 h-2.5 mr-0.5" />
                  Offline
                </Badge>
              )}
              <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-primary/10 touch-manipulation" aria-label="Toggle theme">
                {resolvedTheme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={toggleLanguage} className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-primary/10 touch-manipulation" aria-label="Toggle language">
                <Languages className="h-3.5 w-3.5" />
              </Button>
              <NotificationBell variant="mobile" />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-background pb-[calc(var(--mobile-bottom-nav-height)+env(safe-area-inset-bottom))] lg:pb-0 lg:rounded-tl-2xl lg:shadow-[-4px_0_24px_-12px_rgba(0,0,0,0.1)] lg:border-t lg:border-l lg:border-border/50">
          {/* Dashboard Page */}
          {(currentPage === 'dashboard' || isDashboardMounted) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: currentPage === 'dashboard' ? 1 : 0, y: currentPage === 'dashboard' ? 0 : 8 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className={cn("flex-1 min-h-0 min-w-0 flex flex-col", currentPage !== 'dashboard' && "hidden")}
            >
              <Dashboard onNavigate={handleNavigate} refreshKey={dashboardRefreshKey} />
            </motion.div>
          )}

          {/* Billing Page */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: currentPage === 'billing' ? 1 : 0, y: currentPage === 'billing' ? 0 : 8 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className={cn("flex-1 min-h-0 min-w-0 flex flex-col", currentPage !== 'billing' && "hidden")}
          >
            <div className="flex h-full">
              {/* Product Grid (desktop only) */}
              <div className="flex-1 hidden sm:flex flex-col overflow-hidden">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
                      <p className="text-muted-foreground">Loading products...</p>
                    </div>
                  </div>
                ) : (
                  <ProductGrid searchFocusKey={searchFocusKey} />
                )}
              </div>

              {/* Mobile billing: cart + scan button (no product list) */}
              <div className="flex-1 flex flex-col overflow-hidden w-full sm:hidden min-h-0">
                <div className="px-1.5 py-1.5 border-b bg-background shrink-0">
                  <div className="flex flex-row items-center gap-1.5 w-full">
                    <div className="relative flex-1 min-w-0">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        type="text"
                        enterKeyHint="search"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="Search name or barcode..."
                        value={mobileSearchQuery}
                        onChange={(e) => handleMobileSearchChange(e.target.value)}
                        className="pl-8 pr-8 h-9 text-sm rounded-lg touch-manipulation"
                      />
                      {mobileSearchQuery && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-0.5 top-1/2 -translate-y-1/2 h-8 w-8 p-0 touch-manipulation"
                          onClick={() => { setMobileSearchQuery(''); setMobileSearchResults([]); }}
                          aria-label="Clear Search"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                    <Button size="icon" className="shrink-0 h-9 w-9 rounded-lg touch-manipulation" onClick={handleOpenMobileScanner} aria-label="Scan Barcode">
                      <ScanLine className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Search Results */}
                {mobileSearchQuery && (
                  <div className="border-b bg-background max-h-[38dvh] overflow-y-auto overscroll-contain shrink-0 shadow-sm z-10">
                    <div className="p-1.5">
                      <h3 className="text-[10px] font-medium mb-1 px-1 text-muted-foreground uppercase tracking-wide">
                        Results ({mobileSearchResults.length})
                      </h3>
                      {isMobileSearching ? (
                        <p className="text-xs text-muted-foreground p-1.5">Searching...</p>
                      ) : mobileSearchResults.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-1.5">No products found</p>
                      ) : (
                        <div className="space-y-0.5">
                          {mobileSearchResults.slice(0, 15).map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              className="flex w-full items-center justify-between gap-2 px-2 py-1.5 rounded-lg border bg-card hover:bg-muted/50 active:bg-muted cursor-pointer touch-manipulation text-left min-h-10"
                              onClick={() => {
                                addItem(product, 1);
                                setMobileSearchQuery('');
                                setMobileSearchResults([]);
                                if (navigator?.vibrate) navigator.vibrate(30);
                              }}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-xs truncate leading-tight">{product.name}</p>
                                <p className="text-[10px] text-muted-foreground truncate leading-tight">
                                  {product.barcode ? `${product.barcode} · ` : ''}
                                  {product.currentStock <= 0 ? (
                                    <span className="text-destructive">Out of stock</span>
                                  ) : (
                                    <span>Stock: {product.currentStock}</span>
                                  )}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-semibold text-xs tabular-nums text-primary">{formatPrice(product.sellingPrice)}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex-1 min-h-0 overflow-hidden">
                  <CartPanel onCheckout={handleOpenCheckout} customers={customers} onScan={handleOpenMobileScanner} />
                </div>
              </div>

              {/* Desktop Cart Panel */}
              <aside className="hidden sm:block w-96 border-l bg-card shrink-0">
                <CartPanel onCheckout={handleOpenCheckout} customers={customers} onScan={handleOpenMobileScanner} />
              </aside>
            </div>
          </motion.div>

          {/* Stock Page */}
          {(currentPage === 'stock' || isStockMounted) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: currentPage === 'stock' ? 1 : 0, y: currentPage === 'stock' ? 0 : 8 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className={cn("flex-1 min-h-0 min-w-0 flex flex-col", currentPage !== 'stock' && "hidden")}
            >
              <StockManagement
                onAddProduct={handleAddProduct}
                onEditProduct={handleEditProduct}
                onAddStock={handleAddStock}
                onDeleteProduct={handleDeleteProduct}
                onStatistics={() => setCurrentPage('stock-statistics')}
              />
            </motion.div>
          )}

          {/* Parties Page */}
          {(currentPage === 'parties' || isPartiesMounted) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: currentPage === 'parties' ? 1 : 0, y: currentPage === 'parties' ? 0 : 8 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className={cn("flex-1 min-h-0 min-w-0 flex flex-col", currentPage !== 'parties' && "hidden")}
            >
              <PartiesManagement refreshKey={partiesRefreshKey} />
            </motion.div>
          )}

          {/* Due Collection Page */}
          {(currentPage === 'due-collection' || isDueCollectionMounted) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: currentPage === 'due-collection' ? 1 : 0, y: currentPage === 'due-collection' ? 0 : 8 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className={cn("flex-1 min-h-0 min-w-0 flex flex-col", currentPage !== 'due-collection' && "hidden")}
            >
              <DueCollection />
            </motion.div>
          )}

          {/* Purchase Orders Page */}
          {(currentPage === 'purchase-orders' || isPurchaseOrdersMounted) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: currentPage === 'purchase-orders' ? 1 : 0, y: currentPage === 'purchase-orders' ? 0 : 8 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className={cn("flex-1 min-h-0 min-w-0 flex flex-col", currentPage !== 'purchase-orders' && "hidden")}
            >
              <PurchaseOrderManagement />
            </motion.div>
          )}

          {/* Reports Page */}
          {(currentPage === 'reports' || isReportsMounted) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: currentPage === 'reports' ? 1 : 0, y: currentPage === 'reports' ? 0 : 8 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className={cn("flex-1 min-h-0 min-w-0 flex flex-col", currentPage !== 'reports' && "hidden")}
            >
              <Reports onNavigate={handleNavigate} />
            </motion.div>
          )}

          {/* Expenses Page */}
          {(currentPage === 'expenses' || isExpensesMounted) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: currentPage === 'expenses' ? 1 : 0, y: currentPage === 'expenses' ? 0 : 8 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className={cn("flex-1 min-h-0 min-w-0 flex flex-col", currentPage !== 'expenses' && "hidden")}
            >
              <Expenses onReport={() => setCurrentPage('expenses-report')} />
            </motion.div>
          )}

          {/* Settings Page */}
          {(currentPage === 'settings' || isSettingsMounted) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: currentPage === 'settings' ? 1 : 0, y: currentPage === 'settings' ? 0 : 8 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className={cn("flex-1 min-h-0 min-w-0 flex flex-col", currentPage !== 'settings' && "hidden")}
            >
              <SettingsManagement />
            </motion.div>
          )}

          {/* Other sub-reports or pages that do not need caching */}
          {['stock-statistics', 'expenses-report', 'sales-report', 'payment-report', 'stock-report', 'dues-report', 'products-report', 'categories-report', 'customers-report', 'supplier-report', 'profit-report', 'menu'].includes(currentPage) && (
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="flex-1 flex flex-col min-h-0 min-w-0"
            >
              {renderPageContent()}
            </motion.div>
          )}

          {(currentPage === 'transactions' || isTransactionsPageMounted) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: currentPage === 'transactions' ? 1 : 0, y: currentPage === 'transactions' ? 0 : 8 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className={cn("flex-1 min-h-0 min-w-0 flex flex-col", currentPage !== 'transactions' && "hidden")}
            >
              <TransactionHistory />
            </motion.div>
          )}
          {/* Users management has been moved inside Settings */}
          {(currentPage === 'audit' || isAuditPageMounted) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: currentPage === 'audit' ? 1 : 0, y: currentPage === 'audit' ? 0 : 8 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className={cn("flex-1 min-h-0 flex flex-col", currentPage !== 'audit' && "hidden")}
            >
              <AuditLogs />
            </motion.div>
          )}
        </main>
      {/* Mobile Bottom Navigation — keyboard খোলা থাকলে হাইড */}
      <nav className={cn(
        "lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border/60 bg-card/95 backdrop-blur-md px-0.5 pt-0.5 bottom-nav pb-[max(0.2rem,env(safe-area-inset-bottom))] transition-transform duration-200 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.12)]",
        isKeyboardOpen ? "translate-y-full pointer-events-none" : "translate-y-0"
      )}>
        <div className="flex items-stretch justify-between gap-0.5 min-h-12">
          {mobileBottomNavItems.map((item) => {
            // Direct bottom-nav items always take priority over 'more'
            const directNavIds = new Set(mobileBottomNavItems.filter(i => i.id !== 'more').map(i => i.id));
            const isActive = item.id === 'more'
              ? filteredMoreMenuItems.some(nav => nav.id === currentPage) && !directNavIds.has(currentPage)
              : currentPage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'more') {
                    setMoreMenuOpen(true);
                  } else {
                    setCurrentPage(item.id as PageType);
                  }
                }}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 min-w-0 py-1 rounded-lg text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary transition touch-manipulation active:scale-95',
                  isActive ? 'bg-primary/10 text-primary font-semibold' : ''
                )}
                aria-label={t(item.id as any)}
                aria-current={isActive ? 'page' : undefined}
              >
                <div className="relative [&>svg]:h-4 [&>svg]:w-4">
                  {item.icon}
                  {/* Cart item count badge on the billing button */}
                  {item.id === 'billing' && cartItemCount > 0 && (
                    <Badge className="absolute -top-1.5 -right-2 h-3.5 min-w-3.5 p-0 flex items-center justify-center text-[7px] text-white bg-red-500 border border-white dark:border-card">
                      {locale === 'bn' 
                        ? (cartItemCount > 9 ? '৯+' : convertEnglishToBengaliNumerals(cartItemCount)) 
                        : (cartItemCount > 9 ? '9+' : cartItemCount)}
                    </Badge>
                  )}
                </div>
                <span className="mt-0.5 text-[9px] leading-none truncate max-w-full px-0.5">{t(item.id as any)}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile Cart Sheet — used when accessing cart from billing page header */}
      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <SheetContent side="bottom" className="h-[88dvh] rounded-t-2xl p-0 overflow-hidden pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="px-3 py-1.5 border-b">
            <div className="mx-auto h-1 w-8 rounded-full bg-muted-foreground/30" aria-hidden />
            <SheetTitle className="text-sm font-semibold">{t('cart_nav')}</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100%-2.5rem)] overflow-hidden">
            <CartPanel onCheckout={() => { setMobileCartOpen(false); handleOpenCheckout(); }} customers={customers} onScan={handleOpenMobileScanner} />
          </div>
        </SheetContent>
      </Sheet>

      {/* More Menu Bottom Sheet */}
      <Sheet open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl p-0 max-h-[80dvh] overflow-hidden pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="px-4 pt-4 pb-2 border-b">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
            <SheetTitle className="text-base font-semibold">{t('more')}</SheetTitle>
          </SheetHeader>
          <div className="p-4 overflow-y-auto max-h-[calc(80dvh-5rem)] space-y-4 overscroll-contain">
            <div className="grid grid-cols-4 gap-2">
              {filteredMoreMenuItems.map((item) => {
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-200",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => {
                      setCurrentPage(item.id);
                      setMoreMenuOpen(false);
                    }}
                  >
                    <div className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center",
                      isActive ? "bg-primary/20" : "bg-muted/50"
                    )}>
                      {item.icon}
                    </div>
                    <span className="text-[10px] font-medium leading-tight text-center truncate w-full">
                      {t(item.id as any)}
                    </span>
                  </button>
                );
              })}
            </div>
            
            <Separator />
            
            <div className="flex flex-col gap-3 pt-1 pb-4">
              {activeUser && (
                <div className="flex items-center gap-3 px-2 mb-1">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold shrink-0">
                    {(activeUser.name || activeUser.email || 'U')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-sm leading-none mb-1">{activeUser.name || activeUser.email}</p>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 uppercase font-bold tracking-wider text-muted-foreground">
                      {userRole}
                    </Badge>
                  </div>
                </div>
              )}
              <Button
                variant="destructive"
                className="w-full gap-2 h-10 rounded-xl font-medium"
                onClick={() => {
                  setMoreMenuOpen(false);
                  logout();
                }}
              >
                {t('logout')}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Mobile Scanner Dialog */}
      <CameraScannerDialog
        open={isMobileScannerOpen}
        onOpenChange={(open) => {
          setIsMobileScannerOpen(open);
          if (!open) { setScannedItems([]); setLiveScanError(null); }
        }}
        onBarcodeScanned={handleBarcodeDetected}
        scannedItems={scannedItems}
        liveExternalError={liveScanError}
      />

      {/* Checkout Dialog */}
      <CheckoutDialog
        open={isCheckoutOpen}
        onOpenChange={(open) => {
          setCheckoutOpen(open);
          // Reset completed sale when dialog closes
          if (!open) {
            setCompletedCheckoutSale(null);
          }
        }}
        onComplete={handleCheckoutComplete}
        isProcessing={isProcessingPayment}
        completedSale={completedCheckoutSale}
      />

      {/* Add Stock Dialog */}
      <AddStockDialog
        open={isAddStockOpen}
        onOpenChange={setIsAddStockOpen}
        product={selectedProduct}
        onSubmit={handleStockEntry}
      />

      {/* Product Dialog */}
      {isProductDialogOpen && (
        <ProductDialog
          open={isProductDialogOpen}
          onOpenChange={setIsProductDialogOpen}
          product={selectedProduct}
          onSubmit={handleProductSave}
        />
      )}

      {/* Print Dialog */}
      <PrintDialog
        open={isPrintDialogOpen}
        onOpenChange={setPrintDialogOpen}
        sale={currentSale}
      />
  </div>
</div>
  );
}

