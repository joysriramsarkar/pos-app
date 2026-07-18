/**
 * Load products in pages (cursor) to avoid one huge response.
 * POS still needs the full catalog in memory for barcode search —
 * this only improves transfer / timeout resilience.
 */

export function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object") {
    const e = error as { name?: string; message?: string; code?: number };
    if (e.name === "AbortError" || e.name === "TimeoutError") return true;
    if (e.code === 20) return true; // DOMException ABORT_ERR
    if (typeof e.message === "string" && /abort|cancel/i.test(e.message)) return true;
  }
  if (typeof error === "string" && /abort|cancel/i.test(error)) return true;
  return false;
}

export async function fetchAllProductsFromApi(options?: {
  pageSize?: number;
  signal?: AbortSignal;
  includeInactive?: boolean;
}): Promise<{ products: unknown[]; ok: boolean; error?: string; aborted?: boolean }> {
  const pageSize = options?.pageSize ?? 250;
  const all: unknown[] = [];
  let cursor: string | null = null;
  let guard = 0;

  try {
    do {
      if (options?.signal?.aborted) {
        return {
          products: all,
          ok: false,
          aborted: true,
          error: "aborted",
        };
      }

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
    if (isAbortError(e) || options?.signal?.aborted) {
      return {
        products: all,
        ok: false,
        aborted: true,
        error: "aborted",
      };
    }
    return {
      products: all,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
