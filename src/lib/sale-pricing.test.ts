import { describe, expect, it } from "vitest";
import { checkSalePricingAuthority } from "./sale-pricing";
import { normalizePaymentMethodKey } from "./report-filters";

describe("checkSalePricingAuthority", () => {
  const prices = new Map([
    ["p1", 100],
    ["p2", 200],
  ]);

  it("allows a cashier discount within the 10% limit", () => {
    const result = checkSalePricingAuthority(
      [{ productId: "p1", quantity: 1, totalPrice: 90 }],
      0,
      prices,
      "CASHIER",
    );
    expect(result.ok).toBe(true);
    expect(result.effectiveDiscountPercent).toBeLessThanOrEqual(10);
  });

  it("blocks a cashier discount above 10%", () => {
    const result = checkSalePricingAuthority(
      [{ productId: "p1", quantity: 1, totalPrice: 80 }],
      0,
      prices,
      "CASHIER",
    );
    expect(result.ok).toBe(false);
    expect(result.maxAllowed).toBe(10);
  });

  it("blocks a manipulated unit price (undercharge) even with no explicit discount", () => {
    // Product lists at 100, client sends a line total of 50 → effective 50% off.
    const result = checkSalePricingAuthority(
      [{ productId: "p1", quantity: 1, totalPrice: 50 }],
      0,
      prices,
      "CASHIER",
    );
    expect(result.ok).toBe(false);
  });

  it("accounts for an order-level discount", () => {
    // list 200, charged 200, order discount 50 → 25% effective.
    const result = checkSalePricingAuthority(
      [{ productId: "p2", quantity: 1, totalPrice: 200 }],
      50,
      prices,
      "CASHIER",
    );
    expect(result.ok).toBe(false);
  });

  it("allows owners unlimited discounts", () => {
    const result = checkSalePricingAuthority(
      [{ productId: "p1", quantity: 1, totalPrice: 1 }],
      0,
      prices,
      "OWNER",
    );
    expect(result.ok).toBe(true);
  });

  it("does not block when no authoritative price is known", () => {
    const result = checkSalePricingAuthority(
      [{ productId: "unknown", quantity: 1, totalPrice: 1 }],
      0,
      prices,
      "CASHIER",
    );
    expect(result.ok).toBe(true);
  });

  it("does not flag overcharging as a discount exploit", () => {
    const result = checkSalePricingAuthority(
      [{ productId: "p1", quantity: 1, totalPrice: 150 }],
      0,
      prices,
      "CASHIER",
    );
    expect(result.ok).toBe(true);
  });
});

describe("normalizePaymentMethodKey", () => {
  it("maps DB enum values to canonical report keys", () => {
    expect(normalizePaymentMethodKey("CASH")).toBe("Cash");
    expect(normalizePaymentMethodKey("UPI")).toBe("UPI");
    expect(normalizePaymentMethodKey("MIXED")).toBe("Mixed");
    expect(normalizePaymentMethodKey("CREDIT")).toBe("Due");
    expect(normalizePaymentMethodKey("PREPAID")).toBe("Prepaid");
    expect(normalizePaymentMethodKey("CARD")).toBe("Card");
  });
});
