import { useEffect } from 'react';
import { useCustomersStore } from '@/stores/pos-store';
import { CustomersDB } from '@/lib/offline/indexeddb';

export function usePosCustomers(activeUser: any) {
  const customers = useCustomersStore((state) => state.customers);

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
}
