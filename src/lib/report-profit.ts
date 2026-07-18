/**
 * Shared profit helpers for order / item / customer reports.
 * Cost uses historical costPriceAtSale when > 0, else live buyingPrice.
 */

import type Decimal from "decimal.js";
import { toMoneyNumber } from "@/lib/money";

export type ProfitSort = "profit" | "revenue" | "margin" | "quantity" | "orders";

export function resolveUnitCost(
  productId: string,
  costPriceAtSale: Decimal.Value | null | undefined,
  liveCostMap: Map<string, number>,
): number {
  const snap = toMoneyNumber(costPriceAtSale);
  if (snap > 0) return snap;
  return liveCostMap.get(productId) || 0;
}

export function marginPercent(revenue: number, profit: number): number {
  if (revenue <= 0) return 0;
  return (profit / revenue) * 100;
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function roundPct(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

export interface ProfitAgg {
  revenue: number;
  cost: number;
  profit: number;
  quantity: number;
  orderIds: Set<string>;
}

export function emptyProfitAgg(): ProfitAgg {
  return { revenue: 0, cost: 0, profit: 0, quantity: 0, orderIds: new Set() };
}

export function addLineProfit(
  agg: ProfitAgg,
  opts: {
    revenue: number;
    unitCost: number;
    quantity: number;
    saleId?: string;
  },
): void {
  const lineCost = opts.unitCost * opts.quantity;
  agg.revenue += opts.revenue;
  agg.cost += lineCost;
  agg.profit += opts.revenue - lineCost;
  agg.quantity += opts.quantity;
  if (opts.saleId) agg.orderIds.add(opts.saleId);
}

export function finalizeAgg(agg: ProfitAgg) {
  const revenue = roundMoney(agg.revenue);
  const cost = roundMoney(agg.cost);
  const profit = roundMoney(agg.profit);
  return {
    revenue,
    cost,
    profit,
    quantity: agg.quantity,
    orderCount: agg.orderIds.size,
    margin: roundPct(marginPercent(revenue, profit)),
  };
}

export function sortProfitRows<T extends { profit: number; revenue: number; margin: number }>(
  rows: T[],
  sort: ProfitSort,
  extras?: {
    quantity?: (row: T) => number;
    orders?: (row: T) => number;
  },
): T[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (sort) {
      case "revenue":
        return b.revenue - a.revenue;
      case "margin":
        return b.margin - a.margin;
      case "quantity":
        return (extras?.quantity?.(b) ?? 0) - (extras?.quantity?.(a) ?? 0);
      case "orders":
        return (extras?.orders?.(b) ?? 0) - (extras?.orders?.(a) ?? 0);
      case "profit":
      default:
        return b.profit - a.profit;
    }
  });
  return sorted;
}

export function buildProfitInsights(
  rows: { name: string; profit: number; margin: number; revenue: number }[],
) {
  if (!rows.length) {
    return {
      topByProfit: null as null | { name: string; profit: number },
      lowestMargin: null as null | { name: string; margin: number },
      lossMakers: 0,
    };
  }
  const byProfit = [...rows].sort((a, b) => b.profit - a.profit);
  const withRevenue = rows.filter((r) => r.revenue > 0);
  const byMargin = [...withRevenue].sort((a, b) => a.margin - b.margin);
  return {
    topByProfit: { name: byProfit[0].name, profit: byProfit[0].profit },
    lowestMargin: byMargin[0]
      ? { name: byMargin[0].name, margin: byMargin[0].margin }
      : null,
    lossMakers: rows.filter((r) => r.profit < 0).length,
  };
}
