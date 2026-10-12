/**
 * Canonical sale-totals core (MP-21 / FIN-002).
 *
 * Single source of truth for invoice arithmetic used by BOTH:
 *   - POST /api/sales (online)
 *   - POST /api/sync   (offline replay, action sale:create)
 *
 * Rules (existing behavior, unified — no new business policy):
 *   subtotal      = Σ line totals (client line totals verified by
 *                   findSaleItemTotalMismatch before this runs)
 *   total         = subtotal − discount + tax
 *   amountPaid    = external (cash/UPI) + prepaid used
 *   due           = max(total − amountPaid, 0)
 *   paymentStatus = PAID | DUE (zero paid, customer set) | PARTIAL
 *   walk-in (no customer) must pay in full
 *   MIXED cash + UPI must equal the externally paid amount
 *
 * Throws SaleValidationError with the exact legacy user-facing messages
 * (also normalized client-side by src/lib/api-errors.ts).
 */
import Decimal from "decimal.js";
import { addMoney, subtractMoney, toMoneyDecimal } from "@/lib/money";
import { findSaleItemTotalMismatch } from "@/lib/sale-calculations";

export class SaleValidationError extends Error {}

export interface SaleTotalsItem {
  productId: string;
  productName: string;
  quantity: Decimal.Value;
  unitPrice: Decimal.Value;
  totalPrice: Decimal.Value;
}

export interface ComputeSaleTotalsInput {
  items: SaleTotalsItem[];
  discount?: Decimal.Value | null;
  tax?: Decimal.Value | null;
  amountPaid?: Decimal.Value | null;
  amountReceived?: Decimal.Value | null;
  prepaidAmountUsed?: Decimal.Value | null;
  changeAsPrepayment?: Decimal.Value | null;
  debtRepaymentAmount?: Decimal.Value | null;
  customerId?: string | null;
  paymentMethod?: string | null;
  cashAmount?: Decimal.Value | null;
  upiAmount?: Decimal.Value | null;
}

export type SalePaymentStatus = "PAID" | "DUE" | "PARTIAL";

export interface SaleTotals {
  subtotal: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  totalAmount: Decimal;
  amountReceived: Decimal;
  amountPaidValue: Decimal;
  prepaidToUse: Decimal;
  changeAsPrepayment: Decimal;
  debtRepaymentAmount: Decimal;
  externalPaidAmount: Decimal;
  dueAmount: Decimal;
  paymentStatus: SalePaymentStatus;
  cashAmount: Decimal | null;
  upiAmount: Decimal | null;
}

export function computeSaleTotals(input: ComputeSaleTotalsInput): SaleTotals {
  const {
    items,
    customerId,
    paymentMethod,
    cashAmount: rawCash,
    upiAmount: rawUpi,
  } = input;

  if (!items || items.length === 0) {
    throw new SaleValidationError("Sale must have at least one item");
  }

  const itemTotalMismatch = findSaleItemTotalMismatch(items);
  if (itemTotalMismatch) {
    throw new SaleValidationError(itemTotalMismatch);
  }

  const subtotal = addMoney(...items.map((item) => item.totalPrice));
  const discountAmount = toMoneyDecimal(input.discount ?? 0);
  const taxAmount = toMoneyDecimal(input.tax ?? 0);
  const totalAmount = addMoney(subtractMoney(subtotal, discountAmount), taxAmount);
  const amountReceived = toMoneyDecimal(input.amountReceived ?? 0);
  const amountPaidValue = toMoneyDecimal(input.amountPaid ?? 0);
  const prepaidToUse = toMoneyDecimal(input.prepaidAmountUsed ?? 0);
  const changeAsPrepayment = toMoneyDecimal(input.changeAsPrepayment ?? 0);
  const debtRepaymentAmount = toMoneyDecimal(input.debtRepaymentAmount ?? 0);
  const externalPaidAmount = subtractMoney(amountPaidValue, prepaidToUse);

  if (amountPaidValue.gt(totalAmount)) {
    throw new SaleValidationError("Amount paid cannot exceed sale total");
  }
  if (prepaidToUse.gt(amountPaidValue)) {
    throw new SaleValidationError("Prepaid amount cannot exceed total amount paid");
  }
  if (!customerId && (prepaidToUse.gt(0) || changeAsPrepayment.gt(0))) {
    throw new SaleValidationError("Prepaid balance can only be used with a selected customer");
  }
  if (
    (changeAsPrepayment.gt(0) || debtRepaymentAmount.gt(0)) &&
    amountReceived.lt(addMoney(externalPaidAmount, addMoney(changeAsPrepayment, debtRepaymentAmount)))
  ) {
    throw new SaleValidationError(
      "Received amount does not cover sale payment, prepaid change, and due clearance"
    );
  }

  let paymentStatus: SalePaymentStatus = "PAID";
  if (customerId) {
    if (amountPaidValue.isZero()) paymentStatus = "DUE";
    else if (amountPaidValue.lt(totalAmount)) paymentStatus = "PARTIAL";
  } else if (amountPaidValue.lt(totalAmount)) {
    // Walk-in customers must pay full amount (no one to collect due from).
    throw new SaleValidationError("Walk-in customers must pay the full amount");
  }

  // Split-payment consistency for MIXED sales.
  const methodUpper = paymentMethod ? String(paymentMethod).toUpperCase() : "CASH";
  let cashAmount: Decimal | null = rawCash != null ? toMoneyDecimal(rawCash) : null;
  let upiAmount: Decimal | null = rawUpi != null ? toMoneyDecimal(rawUpi) : null;
  if (methodUpper === "MIXED" && (rawCash != null || rawUpi != null)) {
    const cash = toMoneyDecimal(rawCash ?? 0);
    const upi = toMoneyDecimal(rawUpi ?? 0);
    if (cash.lt(0) || upi.lt(0)) {
      throw new SaleValidationError("Cash/UPI amounts cannot be negative");
    }
    if (!addMoney(cash, upi).equals(externalPaidAmount)) {
      throw new SaleValidationError(
        "Mixed payment: cash + UPI must equal the externally paid amount"
      );
    }
    cashAmount = cash;
    upiAmount = upi;
  }

  const dueAmount = subtractMoney(totalAmount, amountPaidValue);

  return {
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount,
    amountReceived,
    amountPaidValue,
    prepaidToUse,
    changeAsPrepayment,
    debtRepaymentAmount,
    externalPaidAmount,
    dueAmount,
    paymentStatus,
    cashAmount,
    upiAmount,
  };
}
