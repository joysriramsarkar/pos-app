/**
 * Tenant-scoped browser storage.
 *
 * Previously the cart / settings / usage stores persisted to global
 * localStorage keys (e.g. `onuron-pos-cart-v2`). After switching businesses the
 * previous tenant's cart could hydrate into the new business — a data-isolation
 * and UX-correctness bug. These helpers namespace every persisted key by the
 * active `businessId[:userId]`.
 */

import type { StateStorage } from "zustand/middleware";

const SCOPE_STORAGE_KEY = "onuron-pos-active-scope";

let cachedScope: string | null = null;

export function buildScope(
  businessId?: string | null,
  userId?: string | null,
): string {
  if (!businessId) return "";
  return userId ? `${businessId}:${userId}` : businessId;
}

/**
 * Set the active tenant scope used by all scoped storage keys.
 * Returns the resolved scope string.
 */
export function setActiveScope(
  businessId?: string | null,
  userId?: string | null,
): string {
  const scope = buildScope(businessId, userId);
  cachedScope = scope;
  if (typeof window !== "undefined") {
    try {
      if (scope) localStorage.setItem(SCOPE_STORAGE_KEY, scope);
      else localStorage.removeItem(SCOPE_STORAGE_KEY);
    } catch {
      // Storage may be unavailable (private mode) — in-memory cache still works.
    }
  }
  return scope;
}

export function getActiveScope(): string {
  if (cachedScope !== null) return cachedScope;
  if (typeof window === "undefined") {
    cachedScope = "";
    return cachedScope;
  }
  try {
    cachedScope = localStorage.getItem(SCOPE_STORAGE_KEY) || "";
  } catch {
    cachedScope = "";
  }
  return cachedScope;
}

/** Namespace a base storage key with the active tenant scope. */
export function scopedKey(base: string): string {
  const scope = getActiveScope();
  return scope ? `${base}:${scope}` : base;
}

/**
 * Zustand-compatible storage implementation that resolves the tenant-scoped key
 * on every read/write (so it always reflects the current business).
 */
export function createScopedStorage(base: string): StateStorage {
  return {
    getItem: () => {
      if (typeof window === "undefined") return null;
      try {
        return localStorage.getItem(scopedKey(base));
      } catch {
        return null;
      }
    },
    setItem: (_name: string, value: string) => {
      if (typeof window === "undefined") return;
      try {
        localStorage.setItem(scopedKey(base), value);
      } catch {
        // ignore quota / privacy-mode errors
      }
    },
    removeItem: () => {
      if (typeof window === "undefined") return;
      try {
        localStorage.removeItem(scopedKey(base));
      } catch {
        // ignore
      }
    },
  };
}
