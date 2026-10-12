import { describe, expect, it } from "vitest";
import { computeSaleTotals, SaleValidationError } from "@/domain/sales/sale-totals";

function expectRejection(input: Parameters<typeof computeSaleTotals>[0], message: string) {
  try {
    computeSaleTotals(input);
  } catch (e) {
    expect(e).toBeInstanceOf(SaleValidationError);
    expect((e as Error).message).toBe(message);
    return;
  }
  throw new Error(`expected rejection: ${message}`);
}

describe("MP-21 canonical sale totals (online/offline parity)", () => {
  // Golden example from the audit: 3x50 - 10 + 7 = 147; cash 100 + UPI 20; due 27.
  const golden = {
    items: [
      { productId: "p1", productName: "A", quantity: 1, unitPrice: 50, totalPrice: 50 },
      { productId: "p2", productName: "B", quantity: 1, unitPrice: 50, totalPrice: 50 },
      { productId: "p3", productName: "C", quantity: 1, unitPrice: 50, totalPrice: 50 },
    ],
    discount: 10,
    tax: 7,
    amountPaid: 120,
    amountReceived: 120,
    customerId: "c1",
    paymentMethod: "MIXED",
    cashAmount: 100,
    upiAmount: 20,
  };

  it("computes the golden invoice identically for both paths", () => {
    const t = computeSaleTotals(golden);
    expect(t.subtotal.toNumber()).toBe(150);
    expect(t.totalAmount.toNumber()).toBe(147);
    expect(t.externalPaidAmount.toNumber()).toBe(120);
    expect(t.dueAmount.toNumber()).toBe(27);
    expect(t.paymentStatus).toBe("PARTIAL");
  });

  it("marks DUE when nothing is paid and PARTIAL/PAID otherwise", () => {
    expect(computeSaleTotals({ ...golden, amountPaid: 0, amountReceived: 0, paymentMethod: "CASH", cashAmount: undefined, upiAmount: undefined }).paymentStatus).toBe("DUE");
    expect(computeSaleTotals({ ...golden, amountPaid: 147, amountReceived: 147, paymentMethod: "CASH", cashAmount: undefined, upiAmount: undefined }).paymentStatus).toBe("PAID");
  });

  it("rejects overpayment, prepaid abuse, walk-in due and split mismatch", () => {
    expectRejection({ ...golden, amountPaid: 200 }, "Amount paid cannot exceed sale total");
    expectRejection({ ...golden, prepaidAmountUsed: 130 }, "Prepaid amount cannot exceed total amount paid");
    expectRejection({ ...golden, prepaidAmountUsed: 10, amountPaid: 120, customerId: null, paymentMethod: "CASH", cashAmount: undefined, upiAmount: undefined }, "Prepaid balance can only be used with a selected customer");
    expectRejection({ ...golden, customerId: null, amountPaid: 100, amountReceived: 100, paymentMethod: "CASH", cashAmount: undefined, upiAmount: undefined }, "Walk-in customers must pay the full amount");
    expectRejection({ ...golden, cashAmount: 90, upiAmount: 20 }, "Mixed payment: cash + UPI must equal the externally paid amount");
    expectRejection({ ...golden, changeAsPrepayment: 50, amountReceived: 100 }, "Received amount does not cover sale payment, prepaid change, and due clearance");
  });

  it("rejects empty carts and line-total tampering", () => {
    expectRejection({ ...golden, items: [] }, "Sale must have at least one item");
    expectRejection(
      { ...golden, items: [{ productId: "p1", productName: "A", quantity: 1, unitPrice: 50, totalPrice: 999 }] },
      "A total should be 50.00"
    );
  });

  it("handles fractional quantities at full precision", () => {
    const t = computeSaleTotals({
      items: [
        { productId: "p1", productName: "A", quantity: 0.5, unitPrice: 10, totalPrice: 5 },
        { productId: "p2", productName: "B", quantity: 1.25, unitPrice: 1.25, totalPrice: 1.56 },
      ],
      amountPaid: 6.56,
      amountReceived: 6.56,
      customerId: null,
      paymentMethod: "CASH",
    });
    expect(t.subtotal.toNumber()).toBe(6.56);
    expect(t.paymentStatus).toBe("PAID");
  });
});
