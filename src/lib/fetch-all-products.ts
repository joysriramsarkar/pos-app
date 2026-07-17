/**
 * Load products in pages (cursor) to avoid one huge response.
 * POS still needs the full catalog in memory for barcode search —
 * this only improves transfer / timeout resilience.
 */
export async function fetchAllProductsFromApi(options?: {
  pageSize?: number;
  signal?: AbortSignal;
  includeInactive?: boolean;
}): Promise<{ products: unknown[]; ok: boolean; error?: string }> {
  const pageSize = options?.pageSize ?? 250;
  const all: unknown[] = [];
  let cursor: string | null = null;
  let guard = 0;

  try {
    do {
      const qs = new URLSearchParams({ limit: String(pageSize) });
      if (cursor) qs.set("cursor", cursor);
      if (options?.includeInactive) qs.set("includeInactive", "true");

      const res = await fetch(`/api/products?${qs.toString()}`, {
        signal: options?.signal,
      });
      if (!res.ok) {
        return { products: all, ok: false, error: `HTTP ${res.status}` };
      }
      const json = await res.json();
      const batch = Array.isArray(json.data) ? json.data : [];
      all.push(...batch);
      cursor = json.nextCursor ?? null;
      guard += 1;
    } while (cursor && guard < 80);

    return { products: all, ok: true };
  } catch (e) {
    return {
      products: all,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
