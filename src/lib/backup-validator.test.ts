import { describe, expect, it } from "vitest";
import { validateBackup } from "@/lib/backup-validator";

const good = {
  version: "2.1-multi-tenant",
  business: { id: "b1", name: "S", slug: "s" },
  data: {
    products: [{ id: "p1", businessId: "b1", buyingPrice: 10, sellingPrice: 20 }],
    customers: [{ id: "c1", businessId: "b1", totalDue: 0, totalPaid: 0, prepaidBalance: 0 }],
    sales: [{ id: "s1", businessId: "b1", invoiceNumber: "INV-1", subtotal: 40, totalAmount: 40 }],
    saleItems: [
      { id: "i1", saleId: "s1", productId: "p1", totalPrice: 20 },
      { id: "i2", saleId: "s1", productId: "p1", totalPrice: 20 },
    ],
    payments: [],
  },
};

describe("MP-33 backup validator", () => {
  it("accepts a consistent backup", () => {
    const r = validateBackup(good);
    expect(r.ok).toBe(true);
    expect(r.counts.sales).toBe(1);
  });

  it("rejects cross-tenant rows, orphans and duplicate invoices", () => {
    const bad = structuredClone(good) as typeof good;
    (bad.data.products as Array<Record<string, unknown>>).push({ id: "px", businessId: "OTHER" });
    (bad.data.saleItems as Array<Record<string, unknown>>).push({ id: "ix", saleId: "missing", productId: "p1", totalPrice: 1 });
    (bad.data.sales as Array<Record<string, unknown>>).push({ id: "s2", businessId: "b1", invoiceNumber: "INV-1", subtotal: 0, totalAmount: 0 });
    const r = validateBackup(bad);
    expect(r.ok).toBe(false);
    const checks = r.issues.map((i) => i.check);
    expect(checks).toContain("tenant");
    expect(checks).toContain("references");
    expect(checks).toContain("uniqueness");
  });

  it("warns on float drift and subtotal mismatch without failing", () => {
    const w = structuredClone(good) as typeof good;
    (w.data.products[0] as Record<string, unknown>).buyingPrice = 10.005;
    const r = validateBackup(w);
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.check === "money-scale")).toBe(true);
  });

  it("rejects malformed payloads", () => {
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup({ version: "x" }).ok).toBe(false);
  });
});
