'use client';

import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';

import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { Product as ProductType } from '@/types/pos';
import { ProductGrid } from '@/components/pos/ProductGrid';
const CartPanel = dynamic(() => import('@/components/pos/CartPanel'), { ssr: false });
const Dashboard = dynamic(() => import('@/components/pos/Dashboard').then(m => ({ default: m.Dashboard })), { ssr: false });
const StockManagement = dynamic(() => import('@/components/pos/StockManagement').then(m => ({ default: m.StockManagement })), { ssr: false });
const PartiesManagement = dynamic(() => import('@/components/pos/PartiesManagement').then(m => ({ default: m.PartiesManagement })), { ssr: false });
const UsersManagement = dynamic(() => import('@/components/pos/UsersManagement').then(m => ({ default: m.UsersManagement })), { ssr: false });
const TransactionHistory = dynamic(() => import('@/components/pos/TransactionHistory').then(m => ({ default: m.TransactionHistory })), { ssr: false });
const Reports = dynamic(() => import('@/components/pos').then(m => ({ default: m.Reports })), { ssr: false });
const AuditLogs = dynamic(() => import('@/components/pos').then(m => ({ default: m.AuditLogs })), { ssr: false });
const Expenses = dynamic(() => import('@/components/pos/Expenses').then(m => ({ default: m.Expenses })), { ssr: false });
const ExpensesReport = dynamic(() => import('@/components/pos/ExpensesReport').then(m => ({ default: m.ExpensesReport })), { ssr: false });
const ProductStatistics = dynamic(() => import('@/components/pos/ProductStatistics').then(m => ({ default: m.ProductStatistics })), { ssr: false });
const SettingsManagement = dynamic(() => import('@/components/pos/SettingsManagement'), { ssr: false });
import { AddStockDialog, type StockEntryData } from '@/components/pos/AddStockDialog';
import { ProductDialog, type ProductFormData } from '@/components/pos/ProductDialog';
import { CameraScannerDialog } from '@/components/pos/CameraScannerDialog';
import { CheckoutDialog, type PaymentData } from '@/components/pos/CheckoutDialog';
import { PrintDialog } from '@/components/pos/PrintDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOfflineContext } from '@/lib/offline/offline-context';
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
} from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useCartStore, useProductsStore, useSyncStore, useUIStore, useCustomersStore } from '@/stores/pos-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useSimpleBarcodeScanner } from '@/hooks/use-barcode-scanner';
import { ProductsDB, SalesDB, SyncQueueDB, CustomersDB } from '@/lib/offline/indexeddb';
import { STORE_CONFIG } from '@/types/pos';
import type { Product, Sale } from '@/types/pos';
import { cn } from '@/lib/utils';
import { convertBengaliToEnglishNumerals } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/hooks/use-toast';
import { generateInvoiceNumber } from '@/lib/invoice';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';


type PageType = 'dashboard' | 'billing' | 'stock' | 'stock-statistics' | 'parties' | 'reports' | 'transactions' | 'expenses' | 'expenses-report' | 'settings' | 'users' | 'menu' | 'audit';

const navItems: { id: Exclude<PageType, 'menu'>; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'billing', label: 'Billing', icon: <ShoppingCart className="w-5 h-5" /> },
  { id: 'stock', label: 'Inventory Management', icon: <Package className="w-5 h-5" /> },
  { id: 'parties', label: 'Parties', icon: <Users className="w-5 h-5" /> },
  { id: 'reports', label: 'Reports', icon: <FileText className="w-5 h-5" /> },
  { id: 'transactions', label: 'Transactions', icon: <History className="w-5 h-5" /> },
  { id: 'expenses', label: 'Expenses', icon: <Banknote className="w-5 h-5" /> },
  { id: 'users', label: 'Users', icon: <UserCog className="w-5 h-5" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  { id: 'audit', label: 'Audit Logs', icon: <History className="w-5 h-5" /> },
];

// নতুন মোবাইল বটম নেভিগেশন আইটেম যোগ
const mobileBottomNavItems: { id: PageType | 'menu'; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Home', icon: <LayoutDashboard className="w-6 h-6 md:w-5 md:h-5" /> },
  { id: 'billing', label: 'Bill', icon: <ShoppingCart className="w-6 h-6 md:w-5 md:h-5" /> },
  { id: 'stock', label: 'Stock', icon: <Package className="w-6 h-6 md:w-5 md:h-5" /> },
  { id: 'menu', label: 'Menu', icon: <Menu className="w-6 h-6 md:w-5 md:h-5" /> },
];

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
};

function POSDashboard() {
  const t = useTranslations('Navigation');
  const [currentPage, setCurrentPage] = useState<PageType>('billing');
  // isProcessingPayment is now per-tab via UIStore

  // Auth
  const { data: session } = useSession();
  const userRole = (session?.user as { id?: string; role?: string; username?: string })?.role;

  // Offline context - USE THIS INSTEAD OF SYNC STORE for isOnline
  const { isOnline: isOnlineContext, networkStatus } = useOfflineContext();
  const [isOnline, setIsOnline] = useState(isOnlineContext);

  useEffect(() => {
    setIsOnline(isOnlineContext);
  }, [isOnlineContext]);

  // Settings store
  const { settings } = useSettingsStore();
  const storeName = settings?.store_name || STORE_CONFIG.name;
  const storeNameBn = settings?.store_name_bn || STORE_CONFIG.nameBn;
  const [isAddStockOpen, setIsAddStockOpen] = useState(false);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [completedCheckoutSale, setCompletedCheckoutSale] = useState<Sale | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isMobileScannerOpen, setIsMobileScannerOpen] = useState(false);
  const [scannedItems, setScannedItems] = useState<{ name: string; qty: number }[]>([]);
  const [liveScanError, setLiveScanError] = useState<string | null>(null);
  const [mobileSearchQuery, setMobileSearchQuery] = useState('');

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
  const isTabProcessing = useUIStore((state) => state.isTabProcessing);
  const activeTabId = useCartStore((state) => state.activeTabId);
  const isProcessingPayment = isTabProcessing(activeTabId);


  // Filter nav items based on user role
  const filteredNavItems = useMemo(() => {
    if (userRole === 'ADMIN') {
      return navItems;
    } else if (userRole === 'MANAGER') {
      return navItems.filter(item => item.id !== 'users' && item.id !== 'settings' && item.id !== 'audit');
    } else if (userRole === 'CASHIER') {
      return navItems.filter(item =>
        item.id === 'dashboard' ||
        item.id === 'billing' ||
        item.id === 'parties' ||
        item.id === 'transactions'
      );
    } else {
      // VIEWER
      return navItems.filter(item =>
        item.id === 'dashboard' ||
        item.id === 'reports' ||
        item.id === 'transactions'
      );
    }
  }, [userRole]);

  // Mobile product search - server-side with offline fallback
  const [mobileSearchResults, setMobileSearchResults] = useState<ProductType[]>([]);
  const [isMobileSearching, setIsMobileSearching] = useState(false);
  const mobileSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMobileSearchChange = useCallback((query: string) => {
    setMobileSearchQuery(query);
    if (mobileSearchTimerRef.current) clearTimeout(mobileSearchTimerRef.current);
    if (!query.trim()) {
      setMobileSearchResults([]);
      return;
    }
    mobileSearchTimerRef.current = setTimeout(async () => {
      setIsMobileSearching(true);
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(query)}`);
        if (res.ok) {
          const { data } = await res.json();
          setMobileSearchResults(data);
        }
      } catch {
        // offline fallback: search local cache
        const lowerQuery = query.toLowerCase();
        const normalizedQuery = convertBengaliToEnglishNumerals(query);
        setMobileSearchResults(products.filter(p =>
          p.isActive && (
            p.name.toLowerCase().includes(lowerQuery) ||
            p.nameBn?.includes(query) ||
            convertBengaliToEnglishNumerals(p.barcode || '').includes(normalizedQuery)
          )
        ));
      } finally {
        setIsMobileSearching(false);
      }
    }, 300);
  }, [products]);

  // Hydration tracking to prevent mismatches with store-dependent renders
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Load customers on mount
  useEffect(() => {
    if (session?.user?.requiresPasswordChange) return;
    const loadCustomers = async () => {
      setCustomersLoading(true);
      try {
        const res = await fetch('/api/customers');
        if (res.ok) {
          const { data } = await res.json();
          setCustomers(data);
        }
      } catch {
        // silently fail
      } finally {
        setCustomersLoading(false);
      }
    };
    loadCustomers();
  }, [setCustomers, setCustomersLoading, session?.user?.requiresPasswordChange]);

  // Load products on mount
  useEffect(() => {
    if (session?.user?.requiresPasswordChange) return;
    const loadProducts = async () => {
      setLoading(true);
      try {
        // Fetch from API to get actual DB data
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
        
        try {
          const res = await fetch('/api/products?limit=10000', { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (res.ok) {
            const { data: products, nextCursor } = await res.json();
            const hasMore = !!nextCursor;
            setProducts(products, hasMore, nextCursor);
            // Update cache
            await ProductsDB.upsertMany(products);
            setOnline(true);
            return;
          } else {
            console.warn('API returned error:', res.status);
            throw new Error(`API error: ${res.status}`);
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          throw fetchErr;
        }
      } catch (error) {
        console.error('Failed to load products from API:', error instanceof Error ? error.message : String(error));
        // Mark as offline since API failed
        setOnline(false);
        
        try {
          // Fallback to IndexedDB
          const cachedProducts = await ProductsDB.getAll();
          if (cachedProducts.length > 0) {
            setProducts(cachedProducts);
          } else {
            console.warn('No cached products available');
          }
        } catch (dbError) {
          console.error('Failed to load products from cache:', dbError);
        }
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [setProducts, setLoading, setOnline, session?.user?.requiresPasswordChange]);

  // Monitor online status - check both navigator.onLine AND actual API connectivity
  useEffect(() => {
    const checkConnectivity = async () => {
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

    // Check periodically (every 30 seconds — reduced from 10s to avoid background load)
    const interval = setInterval(checkConnectivity, 30000);

    // Listen to navigator online/offline events
    const handleOnline = () => checkConnectivity();
    const handleOffline = () => {
      setOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);

  // Barcode scanner handler
  const lastScannedRef = useRef<{ barcode: string; time: number }>({ barcode: '', time: 0 });

  const handleBarcodeDetected = useCallback(
    (barcode: string) => {
      const now = Date.now();

      // Debounce logic: prevent the same barcode from being scanned multiple times within 1000ms
      if (lastScannedRef.current.barcode === barcode && now - lastScannedRef.current.time < 1000) {
        return;
      }

      lastScannedRef.current = { barcode, time: now };
      const product = getProductByBarcode(barcode);
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
        setLiveScanError(`আইটেম পাওয়া যায়নি: ${barcode}`);
        if (!isMobileScannerOpen) {
          toast({ title: 'Product Not Found', description: `Barcode ${barcode} not found.`, variant: 'destructive' });
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

  // Handle checkout completion

  const processOfflineSale = useCallback(async (paymentData: PaymentData) => {
    let paymentStatus = 'Paid';
    if (paymentData.amountPaid === 0) paymentStatus = 'Due';
    else if (paymentData.amountPaid > 0 && paymentData.amountPaid < paymentData.total) paymentStatus = 'Partial';

    const sale: Sale = {
      id: uuidv4(),
      invoiceNumber: generateInvoiceNumber(),
      customerId: paymentData.customerId,
      userId: (session?.user as { id?: string })?.id,
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
        createdAt: new Date(),
      })),
    } as Sale;

    await SalesDB.save(sale);
    await SyncQueueDB.add({
      id: uuidv4(),
      entityType: 'Sale',
      entityId: sale.id,
      action: 'create',
      payload: JSON.stringify(sale),
      synced: false,
      retryCount: 0,
      createdAt: new Date(),
    });

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
  }, [cartItems, session, updateProductStock, updateCustomerDue, setCurrentSale, setCompletedCheckoutSale, clearCart]);

  const handleCheckoutComplete = useCallback(async (paymentData: PaymentData) => {
    const tabId = activeTabId;
    setTabProcessing(tabId, true);
    
    const salePayload = {
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
      amountReceived: paymentData.amountReceived ?? (paymentData.cashAmount ?? 0) + (paymentData.upiAmount ?? 0),
      cashAmount: paymentData.cashAmount,
      upiAmount: paymentData.upiAmount,
      discount: paymentData.discount,
      tax: paymentData.tax,
      usePrepaid: paymentData.usePrepaid,
      prepaidAmountUsed: paymentData.prepaidAmountUsed,
      changeAsPrepayment: (paymentData.addChangeAsPrepayment && paymentData.change > 0) ? paymentData.change : 0,
    };

    try {
      if (isOnline) {
        try {
          const response = await fetch('/api/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(salePayload),
          });

          if (!response.ok) {
            let errorMessage = 'Failed to create sale';
            try {
              const errorData = await response.json();
              errorMessage = errorData.error || errorMessage;
            } catch {
              errorMessage = `Server error: ${response.statusText}`;
            }

            if (response.status === 401) {
              throw new Error('আপনি লগইন করা নেই। পুনরায় লগইন করুন।');
            }

            if (response.status === 403) {
              throw new Error('আপনার এই কাজ করার অনুমতি নেই।');
            }
            
            const shouldFallbackToOffline = 
              response.status >= 500 || 
              errorMessage.includes('P1001') || 
              errorMessage.includes('connection') || 
              errorMessage.includes('Can\'t reach') || 
              errorMessage.includes('Transaction') || 
              errorMessage.includes('timed out') || 
              errorMessage.includes('pool') || 
              errorMessage.includes('ECONN');
            
            if (shouldFallbackToOffline) {
              console.warn('⚠️ Database unavailable, falling back to offline');
              throw new Error('DATABASE_UNAVAILABLE');
            }
            
            throw new Error(errorMessage);
          }

          const responseData = await response.json();
          const completedSale = responseData.data;

          setCompletedCheckoutSale(completedSale);
          setCurrentSale(completedSale);

          // Update stock locally from the completed sale items instead of refetching all products
          if (completedSale?.items) {
            completedSale.items.forEach((item: any) => {
              updateProductStock(item.productId, -item.quantity);
            });
          }

          clearCart();

          if (paymentData.addChangeAsPrepayment && paymentData.customerId && paymentData.change > 0) {
            await fetch('/api/prepayment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ customerId: paymentData.customerId, amount: paymentData.change }),
            }).catch(console.error);
          }
        } catch (fetchError) {
          if (fetchError instanceof Error && fetchError.message === 'DATABASE_UNAVAILABLE') {
            await processOfflineSale(paymentData);
            toast({ title: 'Database offline', description: 'Sale saved locally.' });
            return;
          }
          throw fetchError;
        }
      } else {
        await processOfflineSale(paymentData);
        toast({ title: 'Offline sale saved', description: 'Will sync when online.' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Checkout failed';
      console.error('Checkout failed:', error);
      
      setCompletedCheckoutSale(null);
      setCheckoutOpen(false);
      
      toast({
        title: 'চেকআউট ব্যর্থ হয়েছে',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setTabProcessing(tabId, false);
    }
  }, [isOnline, processOfflineSale, clearCart, setCurrentSale, setCompletedCheckoutSale, setCheckoutOpen, toast, cartItems, updateProductStock, activeTabId, setTabProcessing]);

  const handleOpenCheckout = useCallback(() => {
    setCheckoutOpen(true);
  }, [setCheckoutOpen]);

  // Handle stock entry
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

        // Update local store with new stock
        updateProductStock(data.productId, data.quantity);

        // Refetch all products to sync database changes
        const productsRes = await fetch('/api/products?limit=10000');
        if (productsRes.ok) {
          const { data: refreshedProducts, nextCursor } = await productsRes.json();
          const hasMore = !!nextCursor;
          setProducts(refreshedProducts, hasMore, nextCursor);
        }

        const productName = products.find(p => p.id === data.productId)?.name ?? 'পণ্য';
        toast({ title: 'স্টক যোগ সফল', description: `"${productName}" এ ${data.quantity} যোগ হয়েছে।` });
        console.log('Stock entry successful:', updatedProduct);
      } else {
        // offline: update local store and queue sync
        updateProductStock(data.productId, data.quantity);
        ProductsDB.updateStock(data.productId, data.quantity).catch(console.error);
        await SyncQueueDB.add({
          id: uuidv4(),
          entityType: 'Product',
          entityId: data.productId,
          action: 'update',
          payload: JSON.stringify({ productId: data.productId, quantityChange: data.quantity }),
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
      if (!isOnline) {
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
        toast({ title: 'প্রোডাক্ট যোগ হয়েছে', description: `"${newProduct.name}" ইনভেন্টরিতে যোগ করা হয়েছে।` });
        return newProduct;
      }
    } catch (error) {
      console.error("Failed to save product:", error);
      toast({
        title: 'Product save error',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      });
    }
  }, [updateProduct, addProduct, isOnline, toast, products]);

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
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shadow-sm">
            <Store className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-sm bg-linear-to-r from-primary to-primary/70 bg-clip-text text-transparent">{storeName}</h1>
            <p className="text-xs text-muted-foreground">{storeNameBn}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        {filteredNavItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleNavigate(item.id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 font-medium group',
              currentPage === item.id
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-[1.02]'
                : 'hover:bg-primary/10 text-foreground hover:text-primary hover:scale-[1.01]'
            )}
          >
            <div className={cn(
              "transition-transform duration-200",
              currentPage === item.id ? "scale-110" : "group-hover:scale-110"
            )}>
              {item.icon}
            </div>
            <span className="font-medium tracking-tight">{t(item.id as any)}</span>
          </button>
        ))}
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
        return <Dashboard onNavigate={handleNavigate} />;
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
                <ProductGrid />
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
                      >
                        <X className="w-3 h-3 md:w-4 md:h-4" />
                      </Button>
                    )}
                  </div>
                  <Button size="sm" className="shrink-0 h-8 w-8 p-0" onClick={handleOpenMobileScanner}>
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
        return <PartiesManagement />;
      case 'reports':
        return <Reports onNavigate={handleNavigate} />;
      case 'transactions':
        return <TransactionHistory />;
      case 'expenses':
        return <Expenses onReport={() => setCurrentPage('expenses-report')} />;
      case 'expenses-report':
        return <ExpensesReport onBack={() => setCurrentPage('expenses')} />;
      case 'audit':
        return <AuditLogs />;
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
                .filter((item) => ['reports', 'settings', 'parties', 'users', 'transactions', 'expenses', 'audit'].includes(item.id))
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
        return <UsersManagement />;
      case 'settings':
        return <SettingsManagement />;
      default:
        return null;
    }
  };

  return (
    <div className="h-dvh w-full overflow-hidden flex flex-col lg:flex-row bg-slate-100/50 dark:bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 border-r border-border/50 bg-card shrink-0 no-print shadow-xs z-10 transition-all duration-300">
        {renderSidebar()}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {/* Mobile Header */}
        <header className="lg:hidden shrink-0 border-b border-border/50 bg-card/80 backdrop-blur-md px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] no-print sticky top-0 z-20">
          <div className="flex items-center justify-between gap-4">
            {/* Store Name */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shadow-sm">
                <Store className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="font-bold text-sm bg-linear-to-r from-primary to-primary/70 bg-clip-text text-transparent">{storeName}</h1>
              </div>
            </div>

            {/* Page indicator for non-billing pages */}
            {currentPage !== 'billing' && (
              <Badge variant="secondary" className="text-xs shadow-sm">
                {currentPage === 'menu' ? 'Menu' : navItems.find(n => n.id === currentPage)?.label}
              </Badge>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-background pb-16 lg:rounded-tl-2xl lg:shadow-[-4px_0_24px_-12px_rgba(0,0,0,0.1)] lg:border-t lg:border-l lg:border-border/50">
          {renderPageContent()}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border/60 bg-card/95 backdrop-blur-sm py-1 px-2 bottom-nav">
        <div className="flex items-center justify-between gap-1">
          {mobileBottomNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'menu') {
                  setCurrentPage('menu');
                } else {
                  setCurrentPage(item.id as PageType);
                }
              }}
              className={cn(
                'flex flex-col items-center justify-center flex-1 py-1 rounded-lg text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary transition',
                currentPage === item.id ? 'bg-primary/10 text-primary font-semibold' : ''
              )}
              aria-label={t(item.id as any)}
            >
              {item.icon}
              <span className="mt-0.5 text-[10px] leading-none">{t(item.id as any)}</span>
            </button>
          ))}
        </div>
      </nav>

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
      <ProductDialog
        open={isProductDialogOpen}
        onOpenChange={setIsProductDialogOpen}
        product={selectedProduct}
        onSubmit={handleProductSave}
      />

      {/* Print Dialog */}
      <PrintDialog
        open={isPrintDialogOpen}
        onOpenChange={setPrintDialogOpen}
        sale={currentSale}
      />
    </div>
  );
}

export default function Home() {
  return (
    <ErrorBoundary>
      <POSDashboard />
    </ErrorBoundary>
  );
}
