// ============================================================================
// IndexedDB Manager for Offline-First POS System
// Lakhan Bhandar - Local Data Persistence
// ============================================================================

import type { Product, Cart, Sale, SyncQueueItem, Customer, Supplier } from '@/types/pos';
import { Decimal } from 'decimal.js';
import { toMoneyNumber } from '@/lib/money';

export const DB_NAME = 'lakhan-bhandar-pos';
export const DB_VERSION = 3; // bumped to include action_queue upgrade for existing DB state

// Database store names
export const STORES = {
  PRODUCTS: 'products',
  CARTS: 'carts',
  SALES: 'sales',
  SYNC_QUEUE: 'sync_queue',
  CUSTOMERS: 'customers',
  SUPPLIERS: 'suppliers',
  PENDING_SALES: 'pending_sales',
} as const;

// ============================================================================
// DATABASE INITIALIZATION
// ============================================================================

let dbInstance: IDBDatabase | null = null;

export async function initDatabase(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;
      const newVersion = event.newVersion ?? DB_VERSION;

      console.info(`IndexedDB upgrading from v${oldVersion} to v${newVersion}`);

      // Database initialization all versions (idempotent checks)
      if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
        const productStore = db.createObjectStore(STORES.PRODUCTS, { keyPath: 'id' });
        productStore.createIndex('barcode', 'barcode', { unique: false });
        productStore.createIndex('category', 'category', { unique: false });
        productStore.createIndex('name', 'name', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
        const customerStore = db.createObjectStore(STORES.CUSTOMERS, { keyPath: 'id' });
        customerStore.createIndex('phone', 'phone', { unique: false });
        customerStore.createIndex('name', 'name', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SUPPLIERS)) {
        const supplierStore = db.createObjectStore(STORES.SUPPLIERS, { keyPath: 'id' });
        supplierStore.createIndex('phone', 'phone', { unique: false });
        supplierStore.createIndex('name', 'name', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.CARTS)) {
        db.createObjectStore(STORES.CARTS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORES.SALES)) {
        const saleStore = db.createObjectStore(STORES.SALES, { keyPath: 'id' });
        saleStore.createIndex('invoiceNumber', 'invoiceNumber', { unique: true });
        saleStore.createIndex('createdAt', 'createdAt', { unique: false });
        saleStore.createIndex('synced', 'offlineSynced', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
        syncStore.createIndex('synced', 'synced', { unique: false });
        syncStore.createIndex('entityType', 'entityType', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.PENDING_SALES)) {
        db.createObjectStore(STORES.PENDING_SALES, { keyPath: 'id' });
      }

      // New in v3: Action queue store (shared component for sync worker)
      if (!db.objectStoreNames.contains('action_queue')) {
        const queueStore = db.createObjectStore('action_queue', { keyPath: 'id' });
        queueStore.createIndex('status', 'status', { unique: false });
        queueStore.createIndex('idempotencyKey', 'idempotencyKey', { unique: true });
        queueStore.createIndex('nextRetryAt', 'nextRetryAt', { unique: false });
        queueStore.createIndex('actionType', 'actionType', { unique: false });
        queueStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

// ============================================================================
// GENERIC CRUD OPERATIONS
// ============================================================================

async function getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
  const db = await initDatabase();
  
  // Check if object store exists, if not throw helpful error
  if (!db.objectStoreNames.contains(storeName)) {
    throw new Error(
      `Object store "${storeName}" not found in IndexedDB. ` +
      `Available stores: ${Array.from(db.objectStoreNames).join(', ')}. ` +
      `This typically means the database needs to be upgraded. Please refresh the page.`
    );
  }
  
  const transaction = db.transaction(storeName, mode);
  return transaction.objectStore(storeName);
}

/**
 * BATCH TRANSACTION: Execute multiple operations in a single transaction
 * Prevents "database connection is closing" errors from rapid sequential operations
 */
async function batchTransaction<T>(
  operations: Array<{
    storeName: string;
    mode: 'readwrite' | 'readonly';
    operation: (store: IDBObjectStore) => IDBRequest<any>;
  }>,
): Promise<any[]> {
  const db = await initDatabase();
  
  // Collect all store names and determine if any need write access
  const storeNames = Array.from(new Set(operations.map(op => op.storeName)));
  const needsWrite = operations.some(op => op.mode === 'readwrite');
  const transactionMode: IDBTransactionMode = needsWrite ? 'readwrite' : 'readonly';
  
  // Create single transaction for all stores
  const transaction = db.transaction(storeNames, transactionMode);
  const results: any[] = [];
  
  return new Promise((resolve, reject) => {
    transaction.onerror = () => {
      console.error('Batch transaction error:', transaction.error);
      reject(transaction.error);
    };
    
    transaction.onabort = () => {
      console.error('Batch transaction aborted');
      reject(new Error('Batch transaction was aborted'));
    };
    
    // Execute all operations
    for (const op of operations) {
      const store = transaction.objectStore(op.storeName);
      const request = op.operation(store);
      
      request.onsuccess = () => {
        results.push(request.result);
      };
      
      request.onerror = () => {
        console.error(`Operation on ${op.storeName} failed:`, request.error);
        transaction.abort();
      };
    }
    
    // Resolve when transaction completes
    transaction.oncomplete = () => {
      resolve(results);
    };
  });
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const store = await getStore(storeName);
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getFromStore<T>(storeName: string, key: string): Promise<T | undefined> {
  const store = await getStore(storeName);
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putToStore<T>(storeName: string, data: T): Promise<string> {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result as string);
    request.onerror = () => reject(request.error);
  });
}

async function deleteFromStore(storeName: string, key: string): Promise<void> {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function clearStore(storeName: string): Promise<void> {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// PRODUCTS OPERATIONS
// ============================================================================

export const ProductsDB = {
  async getAll(): Promise<Product[]> {
    return getAllFromStore<Product>(STORES.PRODUCTS);
  },

  async getById(id: string): Promise<Product | undefined> {
    return getFromStore<Product>(STORES.PRODUCTS, id);
  },

  async getByBarcode(barcode: string): Promise<Product | undefined> {
    const db = await initDatabase();
    const transaction = db.transaction(STORES.PRODUCTS, 'readonly');
    const store = transaction.objectStore(STORES.PRODUCTS);
    const index = store.index('barcode');

    return new Promise((resolve, reject) => {
      const request = index.get(barcode);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async searchByName(query: string): Promise<Product[]> {
    const products = await this.getAll();
    const lowerQuery = query.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(lowerQuery) ||
        p.nameBn?.includes(query) ||
        p.barcode?.includes(query)
    );
  },

  async upsert(product: Product): Promise<void> {
    await putToStore(STORES.PRODUCTS, product);
  },

  async upsertMany(products: Product[]): Promise<void> {
    const db = await initDatabase();
    const transaction = db.transaction(STORES.PRODUCTS, 'readwrite');
    const store = transaction.objectStore(STORES.PRODUCTS);

    for (const product of products) {
      store.put(product);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async clear(): Promise<void> {
    return clearStore(STORES.PRODUCTS);
  },

  async updateStock(productId: string, quantityChange: number): Promise<void> {
    const product = await this.getById(productId);
    if (product) {
      product.currentStock = Math.max(0, product.currentStock + quantityChange);
      await putToStore(STORES.PRODUCTS, product);
    }
  },
};

// ============================================================================
// CUSTOMERS OPERATIONS
// ============================================================================

export const CustomersDB = {
  async getAll(): Promise<Customer[]> {
    return getAllFromStore<Customer>(STORES.CUSTOMERS);
  },

  async getById(id: string): Promise<Customer | undefined> {
    return getFromStore<Customer>(STORES.CUSTOMERS, id);
  },

  async getByPhone(phone: string): Promise<Customer | undefined> {
    const db = await initDatabase();
    const transaction = db.transaction(STORES.CUSTOMERS, 'readonly');
    const store = transaction.objectStore(STORES.CUSTOMERS);
    const index = store.index('phone');

    return new Promise((resolve, reject) => {
      const request = index.get(phone);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async upsert(customer: Customer): Promise<void> {
    await putToStore(STORES.CUSTOMERS, customer);
  },

  async upsertMany(customers: Customer[]): Promise<void> {
    const db = await initDatabase();
    const transaction = db.transaction(STORES.CUSTOMERS, 'readwrite');
    const store = transaction.objectStore(STORES.CUSTOMERS);

    for (const customer of customers) {
      store.put(customer);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async updateDue(customerId: string, amountChange: number): Promise<void> {
    const customer = await this.getById(customerId);
    if (customer) {
        customer.totalDue = toMoneyNumber(new Decimal(customer.totalDue).plus(amountChange));
      await putToStore(STORES.CUSTOMERS, customer);
    }
  },

  async updatePrepaid(customerId: string, amountChange: number): Promise<void> {
    const customer = await this.getById(customerId);
    if (customer) {
      customer.prepaidBalance = Math.max(0, (customer.prepaidBalance || 0) + amountChange);
      await putToStore(STORES.CUSTOMERS, customer);
    }
  },

  async clear(): Promise<void> {
    return clearStore(STORES.CUSTOMERS);
  },
};

// ============================================================================
// SUPPLIERS OPERATIONS (Offline Supplier Lookup)
// ============================================================================

export const SuppliersDB = {
  async getAll(): Promise<Supplier[]> {
    return getAllFromStore<Supplier>(STORES.SUPPLIERS);
  },

  async getById(id: string): Promise<Supplier | undefined> {
    return getFromStore<Supplier>(STORES.SUPPLIERS, id);
  },

  async getByPhone(phone: string): Promise<Supplier | undefined> {
    const db = await initDatabase();
    const transaction = db.transaction(STORES.SUPPLIERS, 'readonly');
    const store = transaction.objectStore(STORES.SUPPLIERS);
    const index = store.index('phone');

    return new Promise((resolve, reject) => {
      const request = index.get(phone);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async searchByName(query: string): Promise<Supplier[]> {
    const suppliers = await this.getAll();
    const lowerQuery = query.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerQuery) ||
        s.phone?.includes(query)
    );
  },

  async upsert(supplier: Supplier): Promise<void> {
    await putToStore(STORES.SUPPLIERS, supplier);
  },

  async upsertMany(suppliers: Supplier[]): Promise<void> {
    const db = await initDatabase();
    const transaction = db.transaction(STORES.SUPPLIERS, 'readwrite');
    const store = transaction.objectStore(STORES.SUPPLIERS);

    for (const supplier of suppliers) {
      store.put(supplier);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async clear(): Promise<void> {
    return clearStore(STORES.SUPPLIERS);
  },
};

// ============================================================================
// CART OPERATIONS
// ============================================================================

export const CartDB = {
  async getCurrent(userId?: string): Promise<Cart | undefined> {
    return getFromStore<Cart>(STORES.CARTS, userId ? `current_${userId}` : 'current');
  },

  async save(cart: Cart, userId?: string): Promise<void> {
    const key = userId ? `current_${userId}` : 'current';
    await putToStore(STORES.CARTS, { ...cart, id: key });
  },

  async clear(userId?: string): Promise<void> {
    const key = userId ? `current_${userId}` : 'current';
    await deleteFromStore(STORES.CARTS, key);
  },
};

// ============================================================================
// SALES OPERATIONS (Offline Sales)
// ============================================================================

export const SalesDB = {
  async getAll(): Promise<Sale[]> {
    return getAllFromStore<Sale>(STORES.SALES);
  },

  async getById(id: string): Promise<Sale | undefined> {
    return getFromStore<Sale>(STORES.SALES, id);
  },

  async getUnsynced(): Promise<Sale[]> {
    const db = await initDatabase();
    const transaction = db.transaction(STORES.SALES, 'readonly');
    const store = transaction.objectStore(STORES.SALES);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result.filter((s: Sale) => !s.offlineSynced));
      request.onerror = () => reject(request.error);
    });
  },

  async save(sale: Sale): Promise<void> {
    await putToStore(STORES.SALES, sale);
  },

  async markSynced(id: string): Promise<void> {
    const sale = await this.getById(id);
    if (sale) {
      sale.offlineSynced = true;
      await putToStore(STORES.SALES, sale);
    }
  },

  async clear(): Promise<void> {
    return clearStore(STORES.SALES);
  },
};

// ============================================================================
// SYNC QUEUE OPERATIONS
// ============================================================================

export const SyncQueueDB = {
  async getAll(): Promise<SyncQueueItem[]> {
    return getAllFromStore<SyncQueueItem>(STORES.SYNC_QUEUE);
  },

  async getUnsynced(): Promise<SyncQueueItem[]> {
    const db = await initDatabase();
    const transaction = db.transaction(STORES.SYNC_QUEUE, 'readonly');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result.filter((i: SyncQueueItem) => !i.synced && !i.failed));
      request.onerror = () => reject(request.error);
    });
  },

  async add(item: SyncQueueItem): Promise<void> {
    await putToStore(STORES.SYNC_QUEUE, item);
  },

  async markSynced(id: string): Promise<void> {
    const item = await getFromStore<SyncQueueItem>(STORES.SYNC_QUEUE, id);
    if (item) {
      item.synced = true;
      item.syncedAt = new Date();
      await putToStore(STORES.SYNC_QUEUE, item);
    }
  },

  async markFailed(id: string, error?: string): Promise<void> {
    const item = await getFromStore<SyncQueueItem>(STORES.SYNC_QUEUE, id);
    if (item) {
      item.failed = true;
      if (error) item.error = error;
      await putToStore(STORES.SYNC_QUEUE, item);
    }
  },

  async getFailed(): Promise<SyncQueueItem[]> {
    const all = await getAllFromStore<SyncQueueItem>(STORES.SYNC_QUEUE);
    return all.filter((i) => i.failed);
  },

  async incrementRetry(id: string, error?: string): Promise<void> {
    const item = await getFromStore<SyncQueueItem>(STORES.SYNC_QUEUE, id);
    if (item) {
      item.retryCount += 1;
      if (error) item.error = error;
      await putToStore(STORES.SYNC_QUEUE, item);
    }
  },

  async delete(id: string): Promise<void> {
    await deleteFromStore(STORES.SYNC_QUEUE, id);
  },

  async clear(): Promise<void> {
    return clearStore(STORES.SYNC_QUEUE);
  },
};

// ============================================================================
// BATCH OPERATIONS (Prevent "connection is closing" errors)
// ============================================================================

/**
 * Save sale with its sync queue entry in a single atomic transaction
 * This prevents the "database connection is closing" error that occurs
 * when multiple rapid sequential transactions happen
 */
export async function saveSaleWithSyncQueue(
  sale: Sale,
  syncQueueItem: SyncQueueItem,
): Promise<void> {
  const db = await initDatabase();
  const transaction = db.transaction([STORES.SALES, STORES.SYNC_QUEUE], 'readwrite');
  
  return new Promise((resolve, reject) => {
    transaction.onerror = () => {
      console.error('Save sale transaction error:', transaction.error);
      reject(transaction.error);
    };
    
    transaction.onabort = () => {
      console.error('Save sale transaction aborted');
      reject(new Error('Save sale transaction was aborted'));
    };
    
    const salesStore = transaction.objectStore(STORES.SALES);
    const syncStore = transaction.objectStore(STORES.SYNC_QUEUE);
    
    const saleRequest = salesStore.put(sale);
    const syncRequest = syncStore.put(syncQueueItem);
    
    saleRequest.onerror = () => {
      console.error('Failed to save sale:', saleRequest.error);
      transaction.abort();
    };
    
    syncRequest.onerror = () => {
      console.error('Failed to save sync queue item:', syncRequest.error);
      transaction.abort();
    };
    
    transaction.oncomplete = () => {
      resolve();
    };
  });
}

/**
 * Update multiple products and save customer due in a single transaction
 */
export async function updateProductsAndCustomerDue(
  productUpdates: Array<{ productId: string; product: Product }>,
  customerUpdate?: { customerId: string; customer: Customer },
): Promise<void> {
  const db = await initDatabase();
  const storeNames = [STORES.PRODUCTS];
  if (customerUpdate) storeNames.push(STORES.CUSTOMERS);
  
  const transaction = db.transaction(storeNames, 'readwrite');
  
  return new Promise((resolve, reject) => {
    transaction.onerror = () => {
      console.error('Batch update transaction error:', transaction.error);
      reject(transaction.error);
    };
    
    transaction.onabort = () => {
      console.error('Batch update transaction aborted');
      reject(new Error('Batch update transaction was aborted'));
    };
    
    const productStore = transaction.objectStore(STORES.PRODUCTS);
    
    // Update all products
    for (const { product } of productUpdates) {
      const req = productStore.put(product);
      req.onerror = () => {
        console.error(`Failed to update product ${product.id}:`, req.error);
        transaction.abort();
      };
    }
    
    // Update customer if provided
    if (customerUpdate) {
      const customerStore = transaction.objectStore(STORES.CUSTOMERS);
      const req = customerStore.put(customerUpdate.customer);
      req.onerror = () => {
        console.error(`Failed to update customer ${customerUpdate.customerId}:`, req.error);
        transaction.abort();
      };
    }
    
    transaction.oncomplete = () => {
      resolve();
    };
  });
}

// ============================================================================
// NETWORK STATUS & AUTO-SYNC
// ============================================================================

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

// Initialize database on module load
if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
  initDatabase().catch(console.error);
}
