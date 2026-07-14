export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db as prisma } from "@/lib/db";
import { parseISO } from "date-fns";
import { requirePermission } from "@/lib/api-middleware";

export async function GET(request: NextRequest) {
  const authResponse = await requirePermission(request, "reports.view");
  if (authResponse) return authResponse;

  try {
    const sp = request.nextUrl.searchParams;
    const useSubCategory = sp.get("subCategory") === "true";

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

    const saleItemsWithSale = await prisma.saleItem.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        sale: { status: "Completed" },
      },
      select: {
        saleId: true,
        quantity: true,
        totalPrice: true,
        product: { select: { category: true, subCategory: true, buyingPrice: true } },
      },
    });

    if (useSubCategory) {
      // Group by sub-category
      const subCatMap = new Map<string, { name: string; parentCategory: string; revenue: number; qty: number; profit: number; orders: Set<string> }>();

      saleItemsWithSale.forEach((item) => {
        const subCat = (item.product?.subCategory || "").trim();
        if (!subCat) return; // Skip items without sub-category
        const parentCat = item.product?.category || "General";
        const key = `${parentCat}::${subCat}`;
        const existing = subCatMap.get(key) || { name: subCat, parentCategory: parentCat, revenue: 0, qty: 0, profit: 0, orders: new Set<string>() };
        existing.revenue += Number(item.totalPrice);
        existing.qty += Number(item.quantity);
        existing.profit += Number(item.totalPrice) - Number(item.product?.buyingPrice || 0) * Number(item.quantity);
        existing.orders.add(item.saleId);
        subCatMap.set(key, existing);
      });

      const subCategories = Array.from(subCatMap.values())
        .sort((a, b) => b.revenue - a.revenue);
      const totalRevenue = subCategories.reduce((s, c) => s + c.revenue, 0);
      const result = subCategories.map((c) => ({
        name: c.name,
        parentCategory: c.parentCategory,
        revenue: c.revenue,
        qty: c.qty,
        profit: c.profit,
        orderCount: c.orders.size,
        margin: c.revenue > 0 ? ((c.profit / c.revenue) * 100).toFixed(1) : "0",
        percentage: totalRevenue > 0 ? ((c.revenue / totalRevenue) * 100).toFixed(1) : "0",
      }));

      return NextResponse.json({ categories: result, totalRevenue });
    }

    // Default: group by category
    const catMap = new Map<string, { revenue: number; qty: number; profit: number; orders: Set<string> }>();

    saleItemsWithSale.forEach((item) => {
      const cat = item.product?.category || "General";
      const existing = catMap.get(cat) || { revenue: 0, qty: 0, profit: 0, orders: new Set<string>() };
      existing.revenue += Number(Number(item.totalPrice));
      existing.qty += Number(item.quantity);
      existing.profit += Number(Number(item.totalPrice)) - Number(item.product?.buyingPrice || 0) * Number(item.quantity);
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
