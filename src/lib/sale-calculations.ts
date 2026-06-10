import type { SaleItemInput } from "@/schemas";
import { multiplyMoney, toMoneyNumber } from "@/lib/money";

export interface StockDeduction {
  productId: string;
  quantity: number;
}

export function aggregateSaleItemQuantities(
  items: Pick<SaleItemInput, "productId" | "quantity">[],
): StockDeduction[] {
  const totals = new Map<string, number>();

  for (const item of items) {
    totals.set(
      item.productId,
      Number(((totals.get(item.productId) || 0) + item.quantity).toFixed(6)),
    );
  }

  return Array.from(totals, ([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

export function findSaleItemTotalMismatch(
  items: Pick<
    SaleItemInput,
    "productId" | "productName" | "quantity" | "unitPrice" | "totalPrice"
  >[],
): string | null {
  for (const item of items) {
    const expectedTotal = multiplyMoney(item.quantity, item.unitPrice).toNumber();
    const submittedTotal = toMoneyNumber(item.totalPrice);

    if (submittedTotal !== expectedTotal) {
      return `${item.productName || item.productId} total should be ${expectedTotal.toFixed(2)}`;
    }
  }

  return null;
}
