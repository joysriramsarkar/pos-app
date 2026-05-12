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

    const catMap = new Map<string, { revenue: number; qty: number; profit: number; orders: Set<string> }>();

    const saleItemsWithSale = await prisma.saleItem.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        sale: { status: "Completed" },
      },
      select: {
        saleId: true,
        quantity: true,
        totalPrice: true,
        product: { select: { category: true, buyingPrice: true } },
      },
    });

    saleItemsWithSale.forEach((item) => {
      const cat = item.product?.category || "General";
      const existing = catMap.get(cat) || { revenue: 0, qty: 0, profit: 0, orders: new Set() };
      existing.revenue += Number(item.totalPrice);
      existing.qty += item.quantity;
      existing.profit += Number(item.totalPrice) - Number(item.product?.buyingPrice || 0) * item.quantity;
      existing.orders.add(item.saleId);
      catMap.set(cat, existing);
    });

    const categories = Array.from(catMap.entries())
      .map(([name, v]) => ({
        name,
        revenue: v.revenue,
        qty: v.qty,
        profit: v.profit,
        orderCount: v.orders.size,
        margin: v.revenue > 0 ? ((v.profit / v.revenue) * 100).toFixed(1) : "0",
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = categories.reduce((s, c) => s + c.revenue, 0);
    const result = categories.map((c) => ({
      ...c,
      percentage: totalRevenue > 0 ? ((c.revenue / totalRevenue) * 100).toFixed(1) : "0",
    }));

    return NextResponse.json({ categories: result, totalRevenue });
  } catch (error: unknown) {
    console.error("Failed to fetch category report:", error);
    return NextResponse.json({ error: "Failed to fetch category report" }, { status: 500 });
  }
}
