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

    let startDate: Date;
    let endDate: Date;

    if (sp.get("from") && sp.get("to")) {
      startDate = startOfDay(parseISO(sp.get("from")!));
      endDate = endOfDay(parseISO(sp.get("to")!));
    } else {
      const days = parseInt(sp.get("days") || "30");
      startDate = startOfDay(subDays(new Date(), days - 1));
      endDate = endOfDay(new Date());
    }

    const topProducts = await prisma.saleItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true, totalPrice: true },
      where: {
        createdAt: { gte: startDate, lte: endDate },
        sale: { status: "Completed" },
      },
      orderBy: { _sum: { quantity: "desc" } },
      take: 20,
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
        const profit = revenue - Number(details?.buyingPrice || 0) * quantity;
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
