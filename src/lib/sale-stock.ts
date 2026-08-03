import type { Prisma } from "@prisma/client";
import {
  aggregateSaleItemQuantities,
  type StockDeduction,
} from "@/lib/sale-calculations";
import { toMoneyNumber } from "@/lib/money";

export type AutoAdjustedStockItem = {
  productId: string;
  productName: string;
  requiredQty: number;
  stockBefore: number;
  /** Qty covered by real on-hand stock (never negative). */
  ownedQty: number;
  /** Qty invented via auto-adjust so the sale can complete. */
  shortageQty: number;
};

export type SaleStockPlan = AutoAdjustedStockItem & {
  /** WAC / buying price on the product row. */
  wacUnitCost: number;
  /**
   * Blended unit cost for COGS: owned portion at WAC, shortage at 0
   * (phantom stock has no purchase cost).
   */
  blendedUnitCost: number;
};

export type LockedProductStock = {
  id: string;
  name: string;
  currentStock: number;
  buyingPrice: number;
};

/**
 * Plan stock usage for one product line (after locking / reading stock).
 * - Negative stock is treated as 0 owned (corruption normalized on write).
 * - shortageQty is only the qty beyond owned stock that will be auto-adjusted.
 */
export function planSaleStockUsage(input: {
  productId: string;
  productName: string;
  requiredQty: number;
  stockBefore: number;
  wacUnitCost: number;
}): SaleStockPlan {
  const requiredQty = Number(Number(input.requiredQty).toFixed(6));
  const stockBefore = Number(input.stockBefore);
  const wacUnitCost = Math.max(0, toMoneyNumber(input.wacUnitCost));

  const availableOwned = Math.max(0, stockBefore);
  const ownedQty = Number(Math.min(availableOwned, requiredQty).toFixed(6));
  const shortageQty = Number((requiredQty - ownedQty).toFixed(6));

  const blendedUnitCost =
    requiredQty > 0
      ? Number(((ownedQty * wacUnitCost) / requiredQty).toFixed(6))
      : 0;

  return {
    productId: input.productId,
    productName: input.productName,
    requiredQty,
    stockBefore,
    ownedQty,
    shortageQty,
    wacUnitCost,
    blendedUnitCost,
  };
}

/**
 * Lock products in sorted id order (deadlock-safe) and build stock plans.
 */
export async function lockAndPlanSaleStock(
  tx: Prisma.TransactionClient,
  items: Array<{ productId: string; quantity: number; productName?: string }>,
): Promise<{
  deductions: StockDeduction[];
  plansByProductId: Map<string, SaleStockPlan>;
  autoAdjusted: AutoAdjustedStockItem[];
}> {
  const deductions = aggregateSaleItemQuantities(items);
  deductions.sort((a, b) => a.productId.localeCompare(b.productId));

  const plansByProductId = new Map<string, SaleStockPlan>();
  const autoAdjusted: AutoAdjustedStockItem[] = [];

  for (const d of deductions) {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        name: string;
        current_stock: Prisma.Decimal | number | string;
        buying_price: Prisma.Decimal | number | string;
      }>
    >`
      SELECT id, name, current_stock, buying_price
      FROM products
      WHERE id = ${d.productId}
      FOR UPDATE
    `;

    const row = rows[0];
    if (!row) {
      throw new Error(`Product not found: ${d.productId}`);
    }

    const nameFromItem = items.find((i) => i.productId === d.productId)?.productName;
    const plan = planSaleStockUsage({
      productId: d.productId,
      productName: nameFromItem || row.name,
      requiredQty: d.quantity,
      stockBefore: Number(row.current_stock),
      wacUnitCost: toMoneyNumber(row.buying_price),
    });

    plansByProductId.set(d.productId, plan);

    if (plan.shortageQty > 0 || plan.stockBefore < 0) {
      autoAdjusted.push({
        productId: plan.productId,
        productName: plan.productName,
        requiredQty: plan.requiredQty,
        stockBefore: plan.stockBefore,
        ownedQty: plan.ownedQty,
        shortageQty: plan.shortageQty,
      });
    }
  }

  return { deductions, plansByProductId, autoAdjusted };
}

/**
 * Apply stock deductions + history after sale row exists.
 *
 * Rules:
 * - stockBefore >= required → decrement required (no inventing stock)
 * - stockBefore < required → adjustment of (required - stockBefore), then set stock 0
 *   (covers negative stock normalization + shortage in one audit entry)
 * - Always write sale history -required for full sold qty
 * - Adjustment reason documents auto-adjust for transparency
 */
export async function applySaleStockPlans(
  tx: Prisma.TransactionClient,
  opts: {
    saleId: string;
    invoiceNumber: string;
    plans: SaleStockPlan[];
    historyReasonPrefix?: string;
  },
): Promise<void> {
  const prefix = opts.historyReasonPrefix ?? "Sale";
  // Stable order again for updates (already sorted when planned)
  const plans = [...opts.plans].sort((a, b) =>
    a.productId.localeCompare(b.productId),
  );

  for (const plan of plans) {
    if (plan.requiredQty <= 0) continue;

    if (plan.stockBefore >= plan.requiredQty) {
      // Use conditional decrement to prevent negative stock under concurrent load
      await tx.$executeRaw`
        UPDATE products
        SET current_stock = GREATEST(0, current_stock - ${plan.requiredQty}),
            updated_at = NOW()
        WHERE id = ${plan.productId}
      `;
    } else {
      // gap to invent so: stockBefore + gap - required = 0
      const gap = Number((plan.requiredQty - plan.stockBefore).toFixed(6));
      const parts: string[] = [];
      if (plan.stockBefore < 0) {
        parts.push(`normalized negative stock (${plan.stockBefore})`);
      }
      if (plan.shortageQty > 0) {
        parts.push(`shortage ${plan.shortageQty}`);
      }

      await tx.stockHistory.create({
        data: {
          productId: plan.productId,
          changeType: "adjustment",
          quantity: gap,
          reason: `Auto-adjusted for ${prefix.toLowerCase()}: ${opts.invoiceNumber}${
            parts.length ? ` [${parts.join("; ")}]` : ""
          }`,
          referenceId: opts.saleId,
          saleId: opts.saleId,
        },
      });

      await tx.product.update({
        where: { id: plan.productId },
        data: {
          currentStock: 0,
          updatedAt: new Date(),
        },
      });
    }
  }

  await tx.stockHistory.createMany({
    data: plans
      .filter((p) => p.requiredQty > 0)
      .map((plan) => ({
        productId: plan.productId,
        changeType: "sale",
        quantity: -plan.requiredQty,
        reason: `${prefix}: ${opts.invoiceNumber}`,
        referenceId: opts.saleId,
        saleId: opts.saleId,
      })),
  });
}

/** Blended cost for a cart line's productId from plans map. */
export function costPriceForProduct(
  plansByProductId: Map<string, SaleStockPlan>,
  productId: string,
  fallbackWac = 0,
): number {
  return plansByProductId.get(productId)?.blendedUnitCost ?? fallbackWac;
}
