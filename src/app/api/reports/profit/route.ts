export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { parseISO } from "date-fns";
import { db as prisma } from "@/lib/db";
import { requirePermission } from "@/lib/api-middleware";
import { reportSaleStatusFilter } from "@/lib/report-filters";
import { toMoneyNumber } from "@/lib/money";
import {
  addLineProfit,
  buildProfitInsights,
  emptyProfitAgg,
  finalizeAgg,
  resolveUnitCost,
  roundMoney,
  roundPct,
  sortProfitRows,
  type ProfitSort,
  marginPercent,
} from "@/lib/report-profit";

type GroupBy = "orders" | "items" | "customers";

function parseDateRange(sp: URLSearchParams): { startDate: Date; endDate: Date } {
  const tzOffset = parseInt(sp.get("tzOffset") || "-330");
  const offsetMs = -tzOffset * 60 * 1000;

  if (sp.get("from") && sp.get("to")) {
    const fromDate = parseISO(sp.get("from")!.slice(0, 10));
    const toDate = parseISO(sp.get("to")!.slice(0, 10));

    const startLocal = new Date(
      Date.UTC(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 0, 0, 0, 0),
    );
    const startDate = new Date(startLocal.getTime() - offsetMs);

    const endLocal = new Date(
      Date.UTC(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 0, 0, 0, 0),
    );
    const endDate = new Date(endLocal.getTime() - offsetMs + 24 * 60 * 60 * 1000 - 1);
    return { startDate, endDate };
  }

  const days = parseInt(sp.get("days") || "30");
  const nowUtc = new Date();
  const localNow = new Date(nowUtc.getTime() + offsetMs);
  const endLocal = new Date(
    Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(), 0, 0, 0, 0),
  );
  const endDate = new Date(endLocal.getTime() - offsetMs + 24 * 60 * 60 * 1000 - 1);
  const startLocal = new Date(endLocal.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const startDate = new Date(startLocal.getTime() - offsetMs);
  return { startDate, endDate };
}

export async function GET(request: NextRequest) {
  const authResponse = await requirePermission(request, "reports.view");
  if (authResponse) return authResponse;

  try {
    const sp = request.nextUrl.searchParams;
    const groupBy = (sp.get("groupBy") || "orders") as GroupBy;
    if (!["orders", "items", "customers"].includes(groupBy)) {
      return NextResponse.json(
        { error: "groupBy must be orders, items, or customers" },
        { status: 400 },
      );
    }

    const sort = (sp.get("sort") || "profit") as ProfitSort;
    const limit = Math.min(Math.max(parseInt(sp.get("limit") || "100"), 1), 500);
    const { startDate, endDate } = parseDateRange(sp);

    const saleWhere = {
      createdAt: { gte: startDate, lte: endDate },
      status: reportSaleStatusFilter,
    };

    // One sales load powers all three groupings
    const sales = await prisma.sale.findMany({
      where: saleWhere,
      select: {
        id: true,
        invoiceNumber: true,
        createdAt: true,
        totalAmount: true,
        discount: true,
        paymentMethod: true,
        customerId: true,
        customer: { select: { id: true, name: true, phone: true } },
        items: {
          where: { quantity: { gt: 0 } },
          select: {
            productId: true,
            productName: true,
            quantity: true,
            totalPrice: true,
            costPriceAtSale: true,
            unitPrice: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const productIds = [
      ...new Set(sales.flatMap((s) => s.items.map((i) => i.productId))),
    ];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, nameBn: true, unit: true, buyingPrice: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));
    const liveCostMap = new Map(
      products.map((p) => [p.id, toMoneyNumber(p.buyingPrice)]),
    );

    let totalRevenue = 0;
    let totalCost = 0;
    let totalOrders = sales.length;

    for (const sale of sales) {
      // Align with sales report chart: revenue = invoice totalAmount, cost = line costs
      const rev = toMoneyNumber(sale.totalAmount);
      let cost = 0;
      for (const item of sale.items) {
        const qty = Number(item.quantity);
        cost += resolveUnitCost(item.productId, item.costPriceAtSale, liveCostMap) * qty;
      }
      totalRevenue += rev;
      totalCost += cost;
    }

    const totalProfit = totalRevenue - totalCost;
    const summary = {
      totalRevenue: roundMoney(totalRevenue),
      totalCost: roundMoney(totalCost),
      totalProfit: roundMoney(totalProfit),
      profitMargin: roundPct(marginPercent(totalRevenue, totalProfit)),
      orderCount: totalOrders,
      itemCount: productIds.length,
    };

    if (groupBy === "orders") {
      const rows = sales.map((sale) => {
        const revenue = toMoneyNumber(sale.totalAmount);
        let cost = 0;
        let quantity = 0;
        for (const item of sale.items) {
          const qty = Number(item.quantity);
          quantity += qty;
          cost += resolveUnitCost(item.productId, item.costPriceAtSale, liveCostMap) * qty;
        }
        const profit = revenue - cost;
        return {
          id: sale.id,
          invoiceNumber: sale.invoiceNumber,
          date: sale.createdAt.toISOString(),
          customerId: sale.customerId,
          customerName: sale.customer?.name || null,
          customerPhone: sale.customer?.phone || null,
          paymentMethod: sale.paymentMethod,
          discount: toMoneyNumber(sale.discount),
          itemLines: sale.items.length,
          quantity: roundMoney(quantity),
          revenue: roundMoney(revenue),
          cost: roundMoney(cost),
          profit: roundMoney(profit),
          margin: roundPct(marginPercent(revenue, profit)),
        };
      });

      const sorted = sortProfitRows(rows, sort, {
        quantity: (r) => r.quantity,
        orders: () => 1,
      });
      const limited = sorted.slice(0, limit);

      return NextResponse.json({
        groupBy,
        summary,
        rows: limited,
        insights: buildProfitInsights(
          limited.map((r) => ({
            name: r.invoiceNumber,
            profit: r.profit,
            margin: r.margin,
            revenue: r.revenue,
          })),
        ),
      });
    }

    if (groupBy === "items") {
      const byProduct = new Map<string, ReturnType<typeof emptyProfitAgg>>();

      for (const sale of sales) {
        for (const item of sale.items) {
          const qty = Number(item.quantity);
          const revenue = toMoneyNumber(item.totalPrice);
          const unitCost = resolveUnitCost(item.productId, item.costPriceAtSale, liveCostMap);
          const agg = byProduct.get(item.productId) || emptyProfitAgg();
          addLineProfit(agg, { revenue, unitCost, quantity: qty, saleId: sale.id });
          byProduct.set(item.productId, agg);
        }
      }

      // Allocate order-level discount proportionally so item totals stay honest
      // (optional: we keep line revenue as stored; summary already uses invoice total)

      const rows = [...byProduct.entries()].map(([productId, agg]) => {
        const fin = finalizeAgg(agg);
        const details = productMap.get(productId);
        return {
          id: productId,
          name: details?.name || "Unknown",
          nameBn: details?.nameBn || null,
          unit: details?.unit || "unit",
          quantity: roundMoney(fin.quantity),
          orderCount: fin.orderCount,
          revenue: fin.revenue,
          cost: fin.cost,
          profit: fin.profit,
          margin: fin.margin,
        };
      });

      const sorted = sortProfitRows(rows, sort, {
        quantity: (r) => r.quantity,
        orders: (r) => r.orderCount,
      });
      const limited = sorted.slice(0, limit);

      return NextResponse.json({
        groupBy,
        summary: {
          ...summary,
          // Item-level revenue may differ slightly from invoice total when discounts apply
          lineRevenue: roundMoney(rows.reduce((s, r) => s + r.revenue, 0)),
          lineProfit: roundMoney(rows.reduce((s, r) => s + r.profit, 0)),
        },
        rows: limited,
        insights: buildProfitInsights(
          limited.map((r) => ({
            name: r.name,
            profit: r.profit,
            margin: r.margin,
            revenue: r.revenue,
          })),
        ),
      });
    }

    // customers
    const byCustomer = new Map<
      string,
      {
        agg: ReturnType<typeof emptyProfitAgg>;
        name: string;
        phone: string | null;
      }
    >();

    for (const sale of sales) {
      const key = sale.customerId || "__walk_in__";
      const entry =
        byCustomer.get(key) ||
        {
          agg: emptyProfitAgg(),
          name: sale.customer?.name || "Walk-in",
          phone: sale.customer?.phone || null,
        };

      // Invoice-level revenue/cost for accurate order profit attribution
      const rev = toMoneyNumber(sale.totalAmount);
      let cost = 0;
      let qty = 0;
      for (const item of sale.items) {
        const q = Number(item.quantity);
        qty += q;
        cost += resolveUnitCost(item.productId, item.costPriceAtSale, liveCostMap) * q;
      }
      entry.agg.revenue += rev;
      entry.agg.cost += cost;
      entry.agg.profit += rev - cost;
      entry.agg.quantity += qty;
      entry.agg.orderIds.add(sale.id);
      if (sale.customer?.name) entry.name = sale.customer.name;
      if (sale.customer?.phone) entry.phone = sale.customer.phone;
      byCustomer.set(key, entry);
    }

    const rows = [...byCustomer.entries()].map(([id, entry]) => {
      const fin = finalizeAgg(entry.agg);
      return {
        id: id === "__walk_in__" ? null : id,
        name: entry.name,
        phone: entry.phone,
        isWalkIn: id === "__walk_in__",
        orderCount: fin.orderCount,
        quantity: roundMoney(fin.quantity),
        revenue: fin.revenue,
        cost: fin.cost,
        profit: fin.profit,
        margin: fin.margin,
        aov: fin.orderCount > 0 ? roundMoney(fin.revenue / fin.orderCount) : 0,
      };
    });

    const sorted = sortProfitRows(rows, sort, {
      quantity: (r) => r.quantity,
      orders: (r) => r.orderCount,
    });
    const limited = sorted.slice(0, limit);

    return NextResponse.json({
      groupBy,
      summary,
      rows: limited,
      insights: buildProfitInsights(
        limited.map((r) => ({
          name: r.name,
          profit: r.profit,
          margin: r.margin,
          revenue: r.revenue,
        })),
      ),
    });
  } catch (error: unknown) {
    console.error("Failed to fetch profit report:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch profit report",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
