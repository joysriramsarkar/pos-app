export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db as prisma } from "@/lib/db";
import { parseISO } from "date-fns";
import { requirePermission } from "@/lib/api-middleware";
import { toMoneyNumber } from "@/lib/money";

export async function GET(request: NextRequest) {
  const authResponse = await requirePermission(request, "reports.view");
  if (authResponse) return authResponse;

  try {
    const sp = request.nextUrl.searchParams;

    const tzOffset = parseInt(sp.get("tzOffset") || "-330");
    const offsetMs = -tzOffset * 60 * 1000;

    let startDate: Date;
    let endDate: Date;
    if (sp.get("from") && sp.get("to")) {
      const fromDate = parseISO(sp.get("from")!);
      const toDate = parseISO(sp.get("to")!);

      const startLocal = new Date(Date.UTC(
        fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 0, 0, 0, 0
      ));
      startDate = new Date(startLocal.getTime() - offsetMs);

      const endLocal = new Date(Date.UTC(
        toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 0, 0, 0, 0
      ));
      endDate = new Date(endLocal.getTime() - offsetMs + 24 * 60 * 60 * 1000 - 1);
    } else {
      const days = parseInt(sp.get("days") || "30");
      const nowUtc = new Date();
      const localNow = new Date(nowUtc.getTime() + offsetMs);

      const endLocal = new Date(Date.UTC(
        localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(), 0, 0, 0, 0
      ));
      endDate = new Date(endLocal.getTime() - offsetMs + 24 * 60 * 60 * 1000 - 1);

      const startLocal = new Date(endLocal.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
      startDate = new Date(startLocal.getTime() - offsetMs);
    }

    // Load line items with cost snapshot so profit is historical, not live WAC
    const saleItems = await prisma.saleItem.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        sale: { status: { in: ["Completed", "PartialReturn"] } },
        quantity: { gt: 0 },
      },
      select: {
        productId: true,
        quantity: true,
        totalPrice: true,
        costPriceAtSale: true,
      },
    });

    const byProduct = new Map<
      string,
      { quantity: number; revenue: number; cost: number }
    >();

    for (const item of saleItems) {
      const qty = Number(item.quantity);
      const revenue = toMoneyNumber(item.totalPrice);
      const unitCost = toMoneyNumber(item.costPriceAtSale);
      const prev = byProduct.get(item.productId) || { quantity: 0, revenue: 0, cost: 0 };
      prev.quantity += qty;
      prev.revenue += revenue;
      prev.cost += unitCost * qty;
      byProduct.set(item.productId, prev);
    }

    const productIds = [...byProduct.keys()];
    const productDetails = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        nameBn: true,
        buyingPrice: true,
        unit: true,
      },
    });
    const productsMap = new Map(productDetails.map((p) => [p.id, p]));

    const result = productIds
      .map((productId) => {
        const agg = byProduct.get(productId)!;
        const details = productsMap.get(productId);
        // Fallback: if snapshot is 0 (legacy rows not backfilled), use current buying price
        const cost =
          agg.cost > 0
            ? agg.cost
            : toMoneyNumber(details?.buyingPrice || 0) * Number(agg.quantity);
        const profit = agg.revenue - cost;
        const margin = agg.revenue > 0 ? (profit / agg.revenue) * 100 : 0;
        return {
          id: productId,
          name: details?.name || "Unknown Product",
          nameBn: details?.nameBn,
          unit: details?.unit || "unit",
          quantity: agg.quantity,
          revenue: Math.round(agg.revenue * 100) / 100,
          cost: Math.round(cost * 100) / 100,
          profit: Math.round(profit * 100) / 100,
          margin: Math.round(margin * 10) / 10,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({ topProducts: result });
  } catch (error: unknown) {
    console.error("Failed to fetch product report:", error);
    return NextResponse.json(
      { error: "Failed to fetch product report", details: (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 },
    );
  }
}
