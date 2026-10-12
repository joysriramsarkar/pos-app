import { describe, expect, it } from "vitest";
import { normalizePhoneToE164 } from "@/lib/phone";
import { identityFingerprint } from "@/lib/auth";
import {
  addMoney,
  multiplyMoney,
  parseMoneyStrict,
  toLineTotal,
  toMoneyDecimal,
} from "@/lib/money";
import { formatReceiptPaymentMethod } from "@/lib/receipt-i18n";

describe("MP-05 phone normalization", () => {
  it("normalizes E.164 and never fuzzy-matches", () => {
    expect(normalizePhoneToE164("+8801712345678")).toBe("+8801712345678");
    expect(normalizePhoneToE164("  +919876543210 ")).toBe("+919876543210");
    expect(normalizePhoneToE164("")).toBeNull();
    expect(normalizePhoneToE164("abc")).toBeNull();
  });
});

describe("MP-10 identity fingerprint", () => {
  it("hashes identifiers deterministically without leaking them", () => {
    const a = identityFingerprint("admin");
    const b = identityFingerprint("admin");
    expect(a).toBe(b);
    expect(a).toHaveLength(12);
    expect(a).not.toContain("admin");
  });
});

describe("MP-24 money precision", () => {
  it("sums at full precision and rounds once", () => {
    expect(addMoney("0.1", "0.2").toString()).toBe("0.3");
    expect(toMoneyDecimal("1.005").toString()).toBe("1.01");
  });

  it("computes line totals from 6dp unit prices", () => {
    expect(toLineTotal("1.255555", 3).toString()).toBe("3.77");
  });

  it("keeps unit-price precision at 6dp", () => {
    expect(multiplyMoney("1.25", 3).toString()).toBe("3.75");
  });

  it("rejects empty/NaN/Infinity at the boundary", () => {
    expect(() => parseMoneyStrict("", "total")).toThrow();
    expect(() => parseMoneyStrict(NaN, "total")).toThrow();
    expect(() => parseMoneyStrict(Infinity, "total")).toThrow();
    expect(parseMoneyStrict("12.50").toString()).toBe("12.5");
  });
});

describe("MP-25 receipt payment labels", () => {
  it("maps the full enum, case-insensitively", () => {
    expect(formatReceiptPaymentMethod("CASH", "en")).toBe("Cash");
    expect(formatReceiptPaymentMethod("card", "en")).toBe("Card");
    expect(formatReceiptPaymentMethod("BANK", "bn")).toBe("ব্যাংক");
    expect(formatReceiptPaymentMethod("CREDIT", "bn")).toBe("বাকি");
    expect(formatReceiptPaymentMethod("MIXED", "en")).toBe("Mixed");
    expect(formatReceiptPaymentMethod("PREPAID", "bn")).toBe("প্রিপেইড");
  });
});
