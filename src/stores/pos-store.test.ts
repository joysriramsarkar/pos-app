import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore, useProductsStore, useCustomersStore, useSyncStore, useUIStore } from './pos-store';

describe('useCartStore', () => {
  const initialCartState = {
    tabs: [{
      id: 'tab-1',
      name: 'Bill 1',
      items: [],
      discount: 0,
      tax: 0,
      customerId: undefined,
      customerName: undefined,
      customerPhone: undefined,
      paymentMethod: 'Cash' as const,
      amountPaid: 0,
      notes: '',
      lastScannedBarcode: '',
    }],
    activeTabId: 'tab-1',
    isOfflineMode: false,
    pendingSyncCount: 0,
  };

  beforeEach(() => {
    // Reset state before each test by clearing only state values, preserving actions
    useCartStore.setState(initialCartState, false);
  });

  describe('initial state', () => {
    it('should have the correct initial state', () => {
      const state = useCartStore.getState();
      expect(state.getActiveTab().items).toEqual([]);
      expect(state.getActiveTab().discount).toBe(0);
      expect(state.getActiveTab().tax).toBe(0);
      expect(state.getActiveTab().paymentMethod).toBe('Cash');
      expect(state.isOfflineMode).toBe(false);
      expect(state.pendingSyncCount).toBe(0);
    });
  });

  describe('addItem', () => {
    it('should add a new item to the cart', () => {
      const product = {
        id: 'p1',
        name: 'Test Product',
        barcode: '123456',
        sellingPrice: 100,
        unit: 'piece',
        currentStock: 10,
        category: 'Biscuits',
        isActive: true,
      };

      useCartStore.getState().addItem(product as any, 2);

      const state = useCartStore.getState();
      expect(state.getActiveTab().items.length).toBe(1);

      const item = state.getActiveTab().items[0];
      expect(item.productId).toBe('p1');
      expect(item.productName).toBe('Test Product');
      expect(item.quantity).toBe(2);
      expect(item.unitPrice).toBe(100);
      expect(item.totalPrice).toBe(200);
    });

    it('should increase quantity when adding an existing item', () => {
      const product = {
        id: 'p1',
        name: 'Test Product',
        barcode: '123456',
        sellingPrice: 100,
        unit: 'piece',
        currentStock: 10,
        category: 'Biscuits',
        isActive: true,
      };

      useCartStore.getState().addItem(product as any, 2);
      useCartStore.getState().addItem(product as any, 3);

      const state = useCartStore.getState();
      expect(state.getActiveTab().items.length).toBe(1);

      const item = state.getActiveTab().items[0];
      expect(item.productId).toBe('p1');
      expect(item.quantity).toBe(5);
      expect(item.totalPrice).toBe(500);
    });
  });

  describe('removeItem', () => {
    it('should remove an item from the cart', () => {
      const product = {
        id: 'p1',
        name: 'Test Product',
        sellingPrice: 100,
        unit: 'piece',
        currentStock: 10,
      };

      useCartStore.getState().addItem(product as any, 1);
      let state = useCartStore.getState();
      expect(state.getActiveTab().items.length).toBe(1);

      const itemId = state.getActiveTab().items[0].id;
      useCartStore.getState().removeItem(itemId);

      state = useCartStore.getState();
      expect(state.getActiveTab().items.length).toBe(0);
    });
  });

  describe('updateQuantity', () => {
    it('updates item quantity and totalPrice', () => {
      const product = { id: 'p1', name: 'P', sellingPrice: 50, unit: 'piece', currentStock: 10 };
      useCartStore.getState().addItem(product as any, 2);
      const itemId = useCartStore.getState().getActiveTab().items[0].id;
      useCartStore.getState().updateQuantity(itemId, 5);
      const item = useCartStore.getState().getActiveTab().items[0];
      expect(item.quantity).toBe(5);
      expect(item.totalPrice).toBe(250);
    });

    it('removes item when quantity is 0', () => {
      const product = { id: 'p1', name: 'P', sellingPrice: 50, unit: 'piece', currentStock: 10 };
      useCartStore.getState().addItem(product as any, 2);
      const itemId = useCartStore.getState().getActiveTab().items[0].id;
      useCartStore.getState().updateQuantity(itemId, 0);
      expect(useCartStore.getState().getActiveTab().items).toHaveLength(0);
    });
  });

  describe('getSubtotal / getTotal', () => {
    it('calculates subtotal correctly', () => {
      const p1 = { id: 'p1', name: 'A', sellingPrice: 100, unit: 'piece', currentStock: 10 };
      const p2 = { id: 'p2', name: 'B', sellingPrice: 50, unit: 'piece', currentStock: 10 };
      useCartStore.getState().addItem(p1 as any, 2);
      useCartStore.getState().addItem(p2 as any, 3);
      expect(useCartStore.getState().getSubtotal()).toBe(350);
    });

    it('applies discount and tax in getTotal', () => {
      const p = { id: 'p1', name: 'A', sellingPrice: 100, unit: 'piece', currentStock: 10 };
      useCartStore.getState().addItem(p as any, 2);
      useCartStore.getState().setDiscount(20);
      useCartStore.getState().setTax(10);
      expect(useCartStore.getState().getTotal()).toBe(190);
    });
  });

  describe('tab management', () => {
    it('adds a new tab', () => {
      useCartStore.getState().addTab();
      expect(useCartStore.getState().tabs).toHaveLength(2);
    });

    it('does not remove last tab', () => {
      useCartStore.getState().removeTab('tab-1');
      expect(useCartStore.getState().tabs).toHaveLength(1);
    });

    it('removes a tab and switches active', () => {
      useCartStore.getState().addTab();
      const tabs = useCartStore.getState().tabs;
      const secondTabId = tabs[1].id;
      useCartStore.getState().setActiveTab(secondTabId);
      useCartStore.getState().removeTab(secondTabId);
      expect(useCartStore.getState().tabs).toHaveLength(1);
      expect(useCartStore.getState().activeTabId).toBe('tab-1');
    });
  });

  describe('setCustomer', () => {
    it('sets customer info', () => {
      useCartStore.getState().setCustomer({ id: 'c1', name: 'Alice', phone: '01700000000' } as any);
      const tab = useCartStore.getState().getActiveTab();
      expect(tab.customerId).toBe('c1');
      expect(tab.customerName).toBe('Alice');
    });

    it('clears customer when null passed', () => {
      useCartStore.getState().setCustomer({ id: 'c1', name: 'Alice', phone: '01700000000' } as any);
      useCartStore.getState().setCustomer(null);
      const tab = useCartStore.getState().getActiveTab();
      expect(tab.customerId).toBeUndefined();
      expect(tab.customerName).toBeUndefined();
    });
  });

  describe('clearCart', () => {
    it('clears all items', () => {
      const p = { id: 'p1', name: 'A', sellingPrice: 100, unit: 'piece', currentStock: 10 };
      useCartStore.getState().addItem(p as any, 3);
      useCartStore.getState().clearCart();
      expect(useCartStore.getState().getActiveTab().items).toHaveLength(0);
    });
  });
});

describe('useProductsStore', () => {
  beforeEach(() => {
    useProductsStore.getState().reset();
  });

  it('sets products and derives categories', () => {
    const products = [
      { id: 'p1', name: 'A', category: 'Snacks', barcode: '111', isActive: true } as any,
      { id: 'p2', name: 'B', category: 'Drinks', barcode: '222', isActive: true } as any,
    ];
    useProductsStore.getState().setProducts(products);
    expect(useProductsStore.getState().products).toHaveLength(2);
    expect(useProductsStore.getState().categories).toEqual(['Drinks', 'Snacks']);
  });

  it('appendProducts avoids duplicates', () => {
    const p1 = { id: 'p1', name: 'A', category: 'Snacks', isActive: true } as any;
    useProductsStore.getState().setProducts([p1]);
    useProductsStore.getState().appendProducts([p1, { id: 'p2', name: 'B', category: 'Drinks', isActive: true } as any], false, null);
    expect(useProductsStore.getState().products).toHaveLength(2);
  });

  it('getProductByBarcode finds by barcode', () => {
    const p = { id: 'p1', name: 'A', category: 'X', barcode: '123456789012', isActive: true } as any;
    useProductsStore.getState().setProducts([p]);
    expect(useProductsStore.getState().getProductByBarcode('123456789012')?.id).toBe('p1');
  });

  it('getProductByBarcode handles Bengali barcodes', () => {
    const p = { id: 'p1', name: 'A', category: 'X', barcode: '123456789012', isActive: true } as any;
    useProductsStore.getState().setProducts([p]);
    expect(useProductsStore.getState().getProductByBarcode('১২৩৪৫৬৭৮৯০১২')?.id).toBe('p1');
  });

  it('searchProducts filters by name', () => {
    const products = [
      { id: 'p1', name: 'Lays Chips', category: 'Snacks', isActive: true } as any,
      { id: 'p2', name: 'Pepsi', category: 'Drinks', isActive: true } as any,
    ];
    useProductsStore.getState().setProducts(products);
    const results = useProductsStore.getState().searchProducts('lays');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('p1');
  });

  it('searchProducts excludes inactive products', () => {
    const p = { id: 'p1', name: 'Lays', category: 'Snacks', isActive: false } as any;
    useProductsStore.getState().setProducts([p]);
    expect(useProductsStore.getState().searchProducts('lays')).toHaveLength(0);
  });

  it('updateProductStock adjusts stock', () => {
    const p = { id: 'p1', name: 'A', category: 'X', currentStock: 10, isActive: true } as any;
    useProductsStore.getState().setProducts([p]);
    useProductsStore.getState().updateProductStock('p1', -3);
    expect(useProductsStore.getState().products[0].currentStock).toBe(7);
  });

  it('addProduct and removeProduct work', () => {
    const p = { id: 'p1', name: 'A', category: 'X', isActive: true } as any;
    useProductsStore.getState().addProduct(p);
    expect(useProductsStore.getState().products).toHaveLength(1);
    useProductsStore.getState().removeProduct('p1');
    expect(useProductsStore.getState().products).toHaveLength(0);
  });
});

describe('useCustomersStore', () => {
  beforeEach(() => {
    useCustomersStore.getState().reset();
  });

  it('sets customers', () => {
    const customers = [{ id: 'c1', name: 'Alice', totalDue: 0, prepaidBalance: 0 } as any];
    useCustomersStore.getState().setCustomers(customers);
    expect(useCustomersStore.getState().customers).toHaveLength(1);
  });

  it('addCustomer appends', () => {
    useCustomersStore.getState().addCustomer({ id: 'c1', name: 'Alice', totalDue: 0, prepaidBalance: 0 } as any);
    expect(useCustomersStore.getState().customers).toHaveLength(1);
  });

  it('updateCustomer updates fields', () => {
    useCustomersStore.getState().setCustomers([{ id: 'c1', name: 'Alice', totalDue: 0, prepaidBalance: 0 } as any]);
    useCustomersStore.getState().updateCustomer('c1', { name: 'Bob' });
    expect(useCustomersStore.getState().customers[0].name).toBe('Bob');
  });

  it('updateCustomerDue adds to totalDue', () => {
    useCustomersStore.getState().setCustomers([{ id: 'c1', name: 'Alice', totalDue: 100, prepaidBalance: 0 } as any]);
    useCustomersStore.getState().updateCustomerDue('c1', 50);
    expect(useCustomersStore.getState().customers[0].totalDue).toBe(150);
  });

  it('updateCustomerPrepaid does not go below 0', () => {
    useCustomersStore.getState().setCustomers([{ id: 'c1', name: 'Alice', totalDue: 0, prepaidBalance: 10 } as any]);
    useCustomersStore.getState().updateCustomerPrepaid('c1', -100);
    expect(useCustomersStore.getState().customers[0].prepaidBalance).toBe(0);
  });
});

describe('useSyncStore', () => {
  beforeEach(() => {
    useSyncStore.getState().reset();
  });

  it('initial state is correct', () => {
    const s = useSyncStore.getState();
    expect(s.isOnline).toBe(true);
    expect(s.isSyncing).toBe(false);
    expect(s.pendingCount).toBe(0);
    expect(s.syncErrors).toEqual([]);
  });

  it('setOnline updates isOnline', () => {
    useSyncStore.getState().setOnline(false);
    expect(useSyncStore.getState().isOnline).toBe(false);
  });

  it('addSyncError appends error', () => {
    useSyncStore.getState().addSyncError('Network failed');
    expect(useSyncStore.getState().syncErrors).toEqual(['Network failed']);
  });

  it('clearSyncErrors empties errors', () => {
    useSyncStore.getState().addSyncError('err1');
    useSyncStore.getState().clearSyncErrors();
    expect(useSyncStore.getState().syncErrors).toEqual([]);
  });

  it('setPendingCount updates count', () => {
    useSyncStore.getState().setPendingCount(5);
    expect(useSyncStore.getState().pendingCount).toBe(5);
  });
});

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.getState().reset();
  });

  it('initial state is correct', () => {
    const s = useUIStore.getState();
    expect(s.isSearchOpen).toBe(false);
    expect(s.isCheckoutOpen).toBe(false);
    expect(s.searchQuery).toBe('');
    expect(s.printFormat).toBe('thermal-80');
  });

  it('setSearchOpen toggles search', () => {
    useUIStore.getState().setSearchOpen(true);
    expect(useUIStore.getState().isSearchOpen).toBe(true);
  });

  it('setSearchQuery updates query', () => {
    useUIStore.getState().setSearchQuery('lays');
    expect(useUIStore.getState().searchQuery).toBe('lays');
  });

  it('setPrintFormat updates format', () => {
    useUIStore.getState().setPrintFormat('a4');
    expect(useUIStore.getState().printFormat).toBe('a4');
  });

  it('reset restores defaults', () => {
    useUIStore.getState().setSearchOpen(true);
    useUIStore.getState().setSearchQuery('test');
    useUIStore.getState().reset();
    expect(useUIStore.getState().isSearchOpen).toBe(false);
    expect(useUIStore.getState().searchQuery).toBe('');
  });
});
