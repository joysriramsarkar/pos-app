/**
 * Derive cash/UPI/due/prepaid figures from a sale row.
 * Many legacy sales only set paymentMethod + amountPaid (cashAmount/upiAmount null).
 */
export interface SalePaymentFields {
  totalAmount?: unknown;
  amountPaid?: unknown;
  paymentMethod?: string | null;
  cashAmount?: unknown;
  upiAmount?: unknown;
  status?: string | null;
}

export interface SalePaymentBreakdown {
  cash: number;
  upi: number;
  /** Portion of sale still on credit after this sale's payment */
  dueCreated: number;
  /** External cash/UPI paid toward this sale */
  collected: number;
  total: number;
  paid: number;
}

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

export function breakdownSalePayment(sale: SalePaymentFields): SalePaymentBreakdown {
  const total = Math.max(0, n(sale.totalAmount));
  const paid = Math.max(0, n(sale.amountPaid));
  const method = (sale.paymentMethod || "Cash").trim();

  const hasSplit =
    sale.cashAmount !== null &&
    sale.cashAmount !== undefined &&
    sale.upiAmount !== null &&
    sale.upiAmount !== undefined;

  let cash = 0;
  let upi = 0;

  if (hasSplit || sale.cashAmount != null || sale.upiAmount != null) {
    cash = Math.max(0, n(sale.cashAmount));
    upi = Math.max(0, n(sale.upiAmount));
    // If only one side set, keep the other 0
  } else {
    switch (method) {
      case "Cash":
        cash = paid;
        break;
      case "UPI":
        upi = paid;
        break;
      case "Mixed":
        // Unknown split — attribute all collected to cash (safer for drawer than inventing UPI)
        cash = paid;
        break;
      case "Prepaid":
        // Fully covered by prepaid — no drawer cash/UPI
        cash = 0;
        upi = 0;
        break;
      case "Due":
      default:
        // Partial collections on due sales usually took cash
        cash = paid;
        break;
    }
  }

  const collected = cash + upi;
  // Due created on this bill (what customer still owes for this sale)
  const dueCreated = Math.max(0, total - paid);

  return {
    cash,
    upi,
    dueCreated,
    collected,
    total,
    paid,
  };
}

/** Aggregate many sales into drawer + credit figures for a period */
export function aggregateSalePayments(sales: SalePaymentFields[]) {
  return sales.reduce(
    (acc, sale) => {
      if (sale.status === "Cancelled") return acc;
      const b = breakdownSalePayment(sale);
      acc.cash += b.cash;
      acc.upi += b.upi;
      acc.dueCreated += b.dueCreated;
      acc.collected += b.collected;
      acc.salesTotal += b.total;
      acc.paidTotal += b.paid;
      acc.orders += 1;
      return acc;
    },
    {
      cash: 0,
      upi: 0,
      dueCreated: 0,
      collected: 0,
      salesTotal: 0,
      paidTotal: 0,
      orders: 0,
    },
  );
}
