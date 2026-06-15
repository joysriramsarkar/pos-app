export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db as prisma } from "@/lib/db";
import { startOfDay, endOfDay, parseISO, subDays } from "date-fns";
import { requirePermission } from "@/lib/api-middleware";

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

    const topProducts = await prisma.saleItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true, totalPrice: true },
      where: {
        createdAt: { gte: startDate, lte: endDate },
        sale: { status: "Completed" },
      },
      orderBy: { _sum: { quantity: "desc" } },
    });

    const productDetails = await prisma.product.findMany({
      where: { id: { in: topProducts.map((p) => p.productId) } },
      select: {
        id: true,
        name: true,
        nameBn: true,
        buyingPrice: true,
        unit: true,
      },
    });
    const productsMap = new Map(productDetails.map((p) => [p.id, p]));

    const result = topProducts
      .map((p) => {
        const details = productsMap.get(p.productId);
        const revenue = Number(p._sum.totalPrice || 0);
        const quantity = p._sum.quantity || 0;
        const profit = revenue - Number(details?.buyingPrice || 0) * Number(quantity);
        return {
          id: p.productId,
          name: details?.name || "Unknown Product",
          nameBn: details?.nameBn,
          unit: details?.unit || "unit",
          quantity,
          revenue,
          profit,
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
