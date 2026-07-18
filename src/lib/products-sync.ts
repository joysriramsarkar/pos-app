import { useProductsStore } from '@/stores/pos-store';
import { ProductsDB } from '@/lib/offline/indexeddb';
import { fetchAllProductsFromApi } from '@/lib/fetch-all-products';

export async function refreshProductsFromServer(showLoadingState = false): Promise<boolean> {
  const { setProducts, setLoading } = useProductsStore.getState();
  if (showLoadingState) {
    setLoading(true);
  }

  try {
    const { products, ok } = await fetchAllProductsFromApi({ pageSize: 250 });
    if (!ok || !products.length) {
      // still apply partial if any
      if (products.length) {
        setProducts(products as never[], false, null);
        await ProductsDB.upsertMany(products as never[]);
        return true;
      }
      return false;
    }

    setProducts(products as never[], false, null);
    await ProductsDB.upsertMany(products as never[]);
    return true;
  } catch (error) {
    console.error('Failed to refresh products from server:', error);
    return false;
  } finally {
    if (showLoadingState) {
      setLoading(false);
    }
  }
}
