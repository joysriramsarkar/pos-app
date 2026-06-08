import { useProductsStore } from '@/stores/pos-store';
import { ProductsDB } from '@/lib/offline/indexeddb';

export async function refreshProductsFromServer(): Promise<boolean> {
  const { setProducts, setLoading } = useProductsStore.getState();
  setLoading(true);

  try {
    const res = await fetch('/api/products?limit=10000');
    if (!res.ok) return false;

    const { data: products, nextCursor } = await res.json();
    setProducts(products, !!nextCursor, nextCursor ?? null);
    await ProductsDB.upsertMany(products);
    return true;
  } catch (error) {
    console.error('Failed to refresh products from server:', error);
    return false;
  } finally {
    setLoading(false);
  }
}
