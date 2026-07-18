import { describe, it, expect } from "vitest";
import { breakdownSalePayment, aggregateSalePayments } from "./sale-payment-breakdown";

describe("breakdownSalePayment", () => {
  it("uses cashAmount/upiAmount when present", () => {
    const b = breakdownSalePayment({
      totalAmount: 100,
      amountPaid: 100,
      paymentMethod: "Mixed",
      cashAmount: 60,
      upiAmount: 40,
    });
    expect(b.cash).toBe(60);
    expect(b.upi).toBe(40);
    expect(b.dueCreated).toBe(0);
  });

  it("falls back Cash method to amountPaid when split fields null", () => {
    const b = breakdownSalePayment({
      totalAmount: 367,
      amountPaid: 367,
      paymentMethod: "Cash",
      cashAmount: null,
      upiAmount: null,
    });
    expect(b.cash).toBe(367);
    expect(b.upi).toBe(0);
  });

  it("falls back UPI method correctly", () => {
    const b = breakdownSalePayment({
      totalAmount: 50,
      amountPaid: 50,
      paymentMethod: "UPI",
    });
    expect(b.cash).toBe(0);
    expect(b.upi).toBe(50);
  });

  it("computes dueCreated for partial due sale", () => {
    const b = breakdownSalePayment({
      totalAmount: 200,
      amountPaid: 50,
      paymentMethod: "Due",
    });
    expect(b.cash).toBe(50);
    expect(b.dueCreated).toBe(150);
  });
});

describe("aggregateSalePayments", () => {
  it("sums drawer cash when cashAmount missing", () => {
    const agg = aggregateSalePayments([
      { totalAmount: 100, amountPaid: 100, paymentMethod: "Cash", status: "Completed" },
      { totalAmount: 50, amountPaid: 50, paymentMethod: "UPI", status: "Completed" },
      { totalAmount: 80, amountPaid: 20, paymentMethod: "Due", status: "Completed" },
    ]);
    expect(agg.cash).toBe(120); // 100 + 20
    expect(agg.upi).toBe(50);
    expect(agg.dueCreated).toBe(60);
    expect(agg.orders).toBe(3);
  });
});
