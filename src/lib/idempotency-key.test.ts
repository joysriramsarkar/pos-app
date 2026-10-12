import { describe, expect, it, vi } from "vitest";
import { moneyMutationHeaders, newIdempotencyKey } from "@/lib/idempotency-key";

describe("MP-32 client idempotency keys", () => {
  it("generates unique keys per submission", () => {
    const keys = new Set(Array.from({ length: 100 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(100);
  });

  it("emits JSON + key headers", () => {
    const h = moneyMutationHeaders();
    expect(h["Content-Type"]).toBe("application/json");
    expect(typeof h["X-Idempotency-Key"]).toBe("string");
    expect(h["X-Idempotency-Key"].length).toBeGreaterThan(8);
  });

  it("falls back when crypto.randomUUID is unavailable", () => {
    const orig = globalThis.crypto;
    vi.stubGlobal("crypto", undefined);
    try {
      expect(newIdempotencyKey()).toMatch(/^client-/);
    } finally {
      vi.stubGlobal("crypto", orig);
    }
  });
});
