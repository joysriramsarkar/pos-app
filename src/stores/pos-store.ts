// ============================================================================
// POS Store - Zustand State Management for Lakhan Bhandar
// ============================================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CartItem, PaymentMethod, Product, Customer, Sale } from '@/types/pos';
import { v4 as uuidv4 } from 'uuid';
import { convertBengaliToEnglishNumerals } from '@/lib/utils';
import Decimal from 'decimal.js';
import { toMoneyNumber } from '@/lib/money';

// ============================================================================
// CART STORE
// ============================================================================

interface TabState {
  id: string;
  name: string;
  items: CartItem[];
  discount: number;
  tax: number;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  notes: string;
  lastScannedBarcode: string;
}

interface CartState {
  tabs: TabState[];
  activeTabId: string;
  isOfflineMode: boolean;
  pendingSyncCount: number;
}

interface CartActions {
  addTab: () => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;

  // Active tab getters
  getActiveTab: () => TabState;
  _updateActiveTab: (updates: Partial<TabState>) => void;

  // Active tab actions
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  setDiscount: (discount: number) => void;
  setTax: (tax: number) => void;
  setCustomer: (customer: Customer | null) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setAmountPaid: (amount: number) => void;
  setNotes: (notes: string) => void;
  setLastScannedBarcode: (barcode: string) => void;

  // Global actions
  setOfflineMode: (isOffline: boolean) => void;
  setPendingSyncCount: (count: number) => void;

  // Active tab calculated getters
  getSubtotal: () => number;
  getTotal: () => number;
  getItemCount: () => number;

}

export const useActiveTab = () => {
  return useCartStore((state) => state.getActiveTab());
};

const initialTabState: Omit<TabState, 'id' | 'name'> = {
  items: [],
  discount: 0,
  tax: 0,
  customerId: undefined,
  customerName: undefined,
  customerPhone: undefined,
  paymentMethod: 'Cash',
  amountPaid: 0,
  notes: '',
  lastScannedBarcode: '',
};

const initialCartState: CartState = {
  tabs: [{ id: 'tab-1', name: 'Bill 1', ...initialTabState }],
  activeTabId: 'tab-1',
  isOfflineMode: false,
  pendingSyncCount: 0,
};

export const useCartStore = create<CartState & CartActions>()(
  persist(
    (set, get) => ({
      ...initialCartState,

      getActiveTab: () => {
        const { tabs, activeTabId } = get();
        return tabs.find(t => t.id === activeTabId) || tabs[0];
      },

      addTab: () => set((state) => {
        const newTabId = `tab-${uuidv4()}`;
        const newTabNumber = state.tabs.length + 1;
        return {
          tabs: [...state.tabs, { id: newTabId, name: `Bill ${newTabNumber}`, ...initialTabState }],
          activeTabId: newTabId,
        };
      }),

      removeTab: (tabId: string) => set((state) => {
        if (state.tabs.length === 1) return state;
        const newTabs = state.tabs.filter(t => t.id !== tabId).map((t, i) => ({ ...t, name: `Bill ${i + 1}` }));
        let newActiveTabId = state.activeTabId;
        if (state.activeTabId === tabId) {
          const removedIndex = state.tabs.findIndex(t => t.id === tabId);
          const nextTab = state.tabs[removedIndex + 1] || state.tabs[removedIndex - 1];
          const newTab = newTabs.find(t => t.id === nextTab.id);
          newActiveTabId = newTab ? newTab.id : newTabs[newTabs.length - 1].id;
        }
        return { tabs: newTabs, activeTabId: newActiveTabId };
      }),

      setActiveTab: (tabId: string) => set({ activeTabId: tabId }),

      // --- Active Tab Actions ---

      _updateActiveTab: (updates: Partial<TabState>) => set((state) => ({
        tabs: state.tabs.map(tab => tab.id === state.activeTabId ? { ...tab, ...updates } : tab)
      })),

      addItem: (product: Product, quantity: number = 1) => {
        const tab = get().getActiveTab();
        const currentItems = tab.items;
        const existingItemIndex = currentItems.findIndex(
          (item) => item.productId === product.id
        );

        if (existingItemIndex >= 0) {
          const updatedItems = [...currentItems];
          const existingItem = updatedItems[existingItemIndex];
          const newQuantity = new Decimal(existingItem.quantity).plus(new Decimal(quantity)).toNumber();

          updatedItems[existingItemIndex] = {
            ...existingItem,
            quantity: newQuantity,
            totalPrice: toMoneyNumber(new Decimal(newQuantity).times(new Decimal(existingItem.unitPrice))),
          };
          get()._updateActiveTab({ items: updatedItems });
        } else {
          const newItem: CartItem = {
            id: uuidv4(),
            productId: product.id,
            productName: product.name,
            barcode: product.barcode || undefined,
            quantity: quantity,
            unitPrice: product.sellingPrice,
            totalPrice: toMoneyNumber(new Decimal(quantity).times(new Decimal(product.sellingPrice))),
            unit: product.unit,
            availableStock: product.currentStock,
          };
          get()._updateActiveTab({ items: [...currentItems, newItem] });
        }
      },

      removeItem: (itemId: string) => {
        get()._updateActiveTab({
          items: get().getActiveTab().items.filter((item) => item.id !== itemId),
        });
      },

      updateQuantity: (itemId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(itemId);
          return;
        }
        get()._updateActiveTab({
          items: get().getActiveTab().items.map((item) =>
            item.id === itemId
              ? { ...item, quantity, totalPrice: toMoneyNumber(new Decimal(quantity).times(new Decimal(item.unitPrice))) }
              : item
          ),
        });
      },

      clearCart: () => get()._updateActiveTab(initialTabState),

      setDiscount: (discount: number) => get()._updateActiveTab({ discount }),
      setTax: (tax: number) => get()._updateActiveTab({ tax }),

      setCustomer: (customer: Customer | null) => {
        if (customer) {
          get()._updateActiveTab({
            customerId: customer.id,
            customerName: customer.name,
            customerPhone: customer.phone,
          });
        } else {
          get()._updateActiveTab({
            customerId: undefined,
            customerName: undefined,
            customerPhone: undefined,
          });
        }
      },

      setPaymentMethod: (method: PaymentMethod) => get()._updateActiveTab({ paymentMethod: method }),
      setAmountPaid: (amount: number) => get()._updateActiveTab({ amountPaid: amount }),
      setNotes: (notes: string) => get()._updateActiveTab({ notes: notes }),
      setLastScannedBarcode: (barcode: string) => get()._updateActiveTab({ lastScannedBarcode: barcode }),

      // Global Actions
      setOfflineMode: (isOffline: boolean) => set({ isOfflineMode: isOffline }),
      setPendingSyncCount: (count: number) => set({ pendingSyncCount: count }),

      // Calculations based on active tab
      getSubtotal: () => {
        return toMoneyNumber(get().getActiveTab().items.reduce((sum, item) => new Decimal(sum).plus(new Decimal(item.totalPrice)), new Decimal(0)));
      },

      getTotal: () => {
        const subtotal = get().getSubtotal();
        const { discount, tax } = get().getActiveTab();
        return toMoneyNumber(new Decimal(subtotal).minus(new Decimal(discount)).plus(new Decimal(tax)));
      },

      getItemCount: () => {
        return get().getActiveTab().items.length;
      },
    }),
    {
      name: 'lakhan-bhandar-cart-v2',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
      }),
    }
  )
);

// ============================================================================
// UI STORE
// ============================================================================

interface UIState {
  isSearchOpen: boolean;
  isCheckoutOpen: boolean;
  isPrintDialogOpen: boolean;
  isCustomerDialogOpen: boolean;
  searchQuery: string;
  selectedCategoryId: string | null;
  printFormat: 'thermal-58' | 'thermal-80' | 'a4' | 'a5';
  currentSale: Sale | null;
  processingTabIds: Set<string>;
}

interface UIActions {
  setSearchOpen: (open: boolean) => void;
  setCheckoutOpen: (open: boolean) => void;
  setPrintDialogOpen: (open: boolean) => void;
  setCustomerDialogOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategoryId: (id: string | null) => void;
  setPrintFormat: (format: 'thermal-58' | 'thermal-80' | 'a4' | 'a5') => void;
  setCurrentSale: (sale: Sale | null) => void;
  setTabProcessing: (tabId: string, processing: boolean) => void;
  isTabProcessing: (tabId: string) => boolean;
  reset: () => void;
}

export const useUIStore = create<UIState & UIActions>((set, get) => ({
  isSearchOpen: false,
  isCheckoutOpen: false,
  isPrintDialogOpen: false,
  isCustomerDialogOpen: false,
  searchQuery: '',
  selectedCategoryId: null,
  printFormat: 'thermal-80',
  currentSale: null,
  processingTabIds: new Set<string>(),

  setSearchOpen: (open) => set({ isSearchOpen: open }),
  setCheckoutOpen: (open) => set({ isCheckoutOpen: open }),
  setPrintDialogOpen: (open) => set({ isPrintDialogOpen: open }),
  setCustomerDialogOpen: (open) => set({ isCustomerDialogOpen: open }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCategoryId: (id) => set({ selectedCategoryId: id }),
  setPrintFormat: (format) => set({ printFormat: format }),
  setCurrentSale: (sale) => set({ currentSale: sale }),
  setTabProcessing: (tabId, processing) => set((state) => {
    const next = new Set(state.processingTabIds);
    if (processing) next.add(tabId); else next.delete(tabId);
    return { processingTabIds: next };
  }),
  isTabProcessing: (tabId) => get().processingTabIds.has(tabId),
  reset: () => set({
    isSearchOpen: false,
    isCheckoutOpen: false,
    isPrintDialogOpen: false,
    isCustomerDialogOpen: false,
    searchQuery: '',
    selectedCategoryId: null,
    printFormat: 'thermal-80',
    currentSale: null,
    processingTabIds: new Set<string>(),
  }),
}));

// ============================================================================
// PRODUCTS STORE (for local caching)
// ============================================================================

interface ProductsState {
  products: Product[];
  categories: string[];
  isLoading: boolean;
  lastUpdated: number | null;
  hasMore: boolean;
  nextCursor: string | null;
}

interface ProductsActions {
  setProducts: (products: Product[], hasMore?: boolean, nextCursor?: string | null) => void;
  appendProducts: (products: Product[], hasMore: boolean, nextCursor: string | null) => void;
  setCategories: (categories: string[]) => void;
  setLoading: (loading: boolean) => void;
  updateProductStock: (productId: string, quantityChange: number) => void;
  updateProduct: (id: string, data: Partial<Product>) => void;
  addProduct: (product: Product) => void;
  removeProduct: (id: string) => void;
  getProductByBarcode: (barcode: string) => Product | undefined;
  searchProducts: (query: string) => Product[];
  reset: () => void;
}

export const useProductsStore = create<ProductsState & ProductsActions>((set, get) => ({
  products: [],
  categories: [],
  isLoading: true,
  lastUpdated: null,
  hasMore: false,
  nextCursor: null,

  setProducts: (products, hasMore = false, nextCursor = null) => {
    const categories = [...new Set(products.map((p) => p.category))].sort();
    set({ products, categories, lastUpdated: Date.now(), isLoading: false, hasMore, nextCursor });
  },

  appendProducts: (newProducts, hasMore, nextCursor) => {
    set((state) => {
      // Filter out products that might already exist to avoid duplicates
      const existingIds = new Set(state.products.map(p => p.id));
      const filteredNew = newProducts.filter(p => !existingIds.has(p.id));
      const combinedProducts = [...state.products, ...filteredNew];
      const categories = [...new Set(combinedProducts.map((p) => p.category))].sort();
      return {
        products: combinedProducts,
        categories,
        lastUpdated: Date.now(),
        hasMore,
        nextCursor
      };
    });
  },

  setCategories: (categories) => set({ categories }),
  setLoading: (loading) => set({ isLoading: loading }),

  updateProductStock: (productId, quantityChange) => {
    set((state) => ({
      products: state.products.map((p) =>
        p.id === productId ? { ...p, currentStock: p.currentStock + quantityChange } : p
      ),
    }));
  },

  updateProduct: (id, data) => {
    set((state) => ({
      products: state.products.map((p) =>
        p.id === id ? { ...p, ...data } : p
      ),
      categories: data.category
        ? [...new Set([...state.categories, data.category])].sort()
        : state.categories,
    }));
  },

  addProduct: (product) => {
    set((state) => ({
      products: [...state.products, product],
      categories: [...new Set([...state.categories, product.category])].sort(),
    }));
  },

  removeProduct: (id) => {
    set((state) => ({
      products: state.products.filter((p) => p.id !== id),
    }));
  },

  getProductByBarcode: (barcode) => {
    // Convert Bengali numerals to English for comparison
    const normalizedBarcode = convertBengaliToEnglishNumerals(barcode);
    return get().products.find((p) => {
      const normalizedProductBarcode = convertBengaliToEnglishNumerals(p.barcode || '');
      return normalizedProductBarcode === normalizedBarcode;
    });
  },

  searchProducts: (query) => {
    const lowerQuery = query.toLowerCase();
    const normalizedQuery = convertBengaliToEnglishNumerals(query);
    return get().products.filter(
      (p) =>
        p.isActive &&
        (p.name.toLowerCase().includes(lowerQuery) ||
          p.nameBn?.includes(query) ||
          p.barcode?.includes(query) ||
          convertBengaliToEnglishNumerals(p.barcode || '').includes(normalizedQuery))
    );
  },
  reset: () => set({
    products: [],
    categories: [],
    isLoading: true,
    lastUpdated: null,
    hasMore: false,
    nextCursor: null,
  }),
}));

// ============================================================================
// CUSTOMERS STORE
// ============================================================================

interface CustomersState {
  customers: Customer[];
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

interface CustomersActions {
  setCustomers: (customers: Customer[]) => void;
  addCustomer: (customer: Customer) => void;
  updateCustomer: (id: string, data: Partial<Customer>) => void;
  updateCustomerDue: (id: string, amount: number) => void;
  updateCustomerPrepaid: (id: string, amount: number) => void;
  reset: () => void;
}

export const useCustomersStore = create<CustomersState & CustomersActions>((set, get) => ({
  customers: [],
  isLoading: false,

  setLoading: (loading) => set({ isLoading: loading }),

  setCustomers: (customers) => {
    set({ customers, isLoading: false });
  },

  addCustomer: (customer) => {
    set((state) => ({
      customers: [...state.customers, customer],
    }));
  },

  updateCustomer: (id, data) => {
    set((state) => ({
      customers: state.customers.map((c) =>
        c.id === id ? { ...c, ...data } : c
      ),
    }));
  },

  updateCustomerDue: (id, amount) => {
    set((state) => ({
      customers: state.customers.map((c) =>
        c.id === id
          ? { ...c, totalDue: toMoneyNumber(new Decimal(c.totalDue).plus(amount)) }
          : c
      ),
    }));
  },

  updateCustomerPrepaid: (id, amount) => {
    set((state) => ({
      customers: state.customers.map((c) =>
        c.id === id
          ? { ...c, prepaidBalance: Math.max(0, toMoneyNumber(new Decimal(c.prepaidBalance).plus(amount))) }
          : c
      ),
    }));
  },

  reset: () => set({
    customers: [],
    isLoading: false,
  }),
}));

// ============================================================================
// SYNC STORE (for tracking offline sync status)
// ============================================================================

interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: number | null;
  pendingCount: number;
  syncErrors: string[];
}

interface SyncActions {
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setLastSyncTime: (time: number) => void;
  setPendingCount: (count: number) => void;
  addSyncError: (error: string) => void;
  clearSyncErrors: () => void;
  reset: () => void;
}

export const useSyncStore = create<SyncState & SyncActions>((set) => ({
  isOnline: true,
  isSyncing: false,
  lastSyncTime: null,
  pendingCount: 0,
  syncErrors: [],

  setOnline: (online) => set({ isOnline: online }),
  setSyncing: (syncing) => set({ isSyncing: syncing }),
  setLastSyncTime: (time) => set({ lastSyncTime: time }),
  setPendingCount: (count) => set({ pendingCount: count }),
  addSyncError: (error) => set((state) => ({ syncErrors: [...state.syncErrors, error] })),
  clearSyncErrors: () => set({ syncErrors: [] }),
  reset: () => set({
    isOnline: true,
    isSyncing: false,
    lastSyncTime: null,
    pendingCount: 0,
    syncErrors: [],
  }),
}));

// ============================================================================
// SALES STORE
// ============================================================================

interface SalesState {
  sales: Sale[];
  isLoading: boolean;
}

interface SalesActions {
  setSales: (sales: Sale[]) => void;
  addSale: (sale: Sale) => void;
  updateSaleStatus: (id: string, status: Sale['status']) => void;
  getSaleById: (id: string) => Sale | undefined;
  getSalesByCustomerId: (customerId: string) => Sale[];
}

export const useSalesStore = create<SalesState & SalesActions>()(
  persist(
    (set, get) => ({
      sales: [],
      isLoading: false,

      setSales: (sales) => {
        set({ sales, isLoading: false });
      },

      addSale: (sale) => {
        set((state) => ({
          sales: [sale, ...state.sales],
        }));
      },

      updateSaleStatus: (id, status) => {
        set((state) => ({
          sales: state.sales.map((s) =>
            s.id === id ? { ...s, status } : s
          ),
        }));
      },

      getSaleById: (id) => {
        return get().sales.find((s) => s.id === id);
      },

      getSalesByCustomerId: (customerId) => {
        return get().sales.filter((s) => s.customerId === customerId);
      },
    }),
    {
      name: 'lakhan-bhandar-sales',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sales: state.sales,
      }),
    }
  )
);
