import { describe, expect, it } from "vitest";
import { requestFingerprint, stableStringify } from "@/lib/request-fingerprint";
import { namespacedKey } from "@/lib/idempotency";

describe("P0-A request fingerprints", () => {
  it("is stable across JSON key ordering and nested objects", () => {
    const a = requestFingerprint({ saleId: "s1", items: [{ q: 1, id: "i1" }], method: "Cash" });
    const b = requestFingerprint({ method: "Cash", items: [{ id: "i1", q: 1 }], saleId: "s1" });
    expect(a).toBe(b);
  });

  it("ignores undefined members and treats non-finite numbers as null", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
    expect(stableStringify({ a: NaN })).toBe(stableStringify({ a: null }));
  });

  it("changes when any business value changes", () => {
    const base = { saleId: "s1", items: [{ saleItemId: "i1", quantity: 1 }] };
    const more = { saleId: "s1", items: [{ saleItemId: "i1", quantity: 2 }] };
    expect(requestFingerprint(base)).not.toBe(requestFingerprint(more));
    expect(requestFingerprint(base)).toHaveLength(64);
  });

  it("keeps arrays ordered (line order is part of the request)", () => {
    expect(requestFingerprint([1, 2])).not.toBe(requestFingerprint([2, 1]));
  });
});

describe("P0-A idempotency key namespacing", () => {
  it("cannot collide across tenants or actions", () => {
    const key = "11111111-1111-1111-1111-111111111111";
    expect(namespacedKey("bizA", "sale:create", key)).not.toBe(
      namespacedKey("bizB", "sale:create", key),
    );
    expect(namespacedKey("bizA", "sale:create", key)).not.toBe(
      namespacedKey("bizA", "prepayment:create", key),
    );
  });
});
