export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db as prisma } from "@/lib/db";
import { parseISO } from "date-fns";
import { requirePermission } from "@/lib/api-middleware";
import { toMoneyNumber } from "@/lib/money";
import { resolveUnitCost, roundMoney, roundPct, marginPercent } from "@/lib/report-profit";

export async function GET(request: NextRequest) {
  const authResponse = await requirePermission(request, "reports.view");
  if (authResponse) return authResponse;

  try {
    const sp = request.nextUrl.searchParams;
    const customerId = sp.get("customerId");

    const tzOffset = parseInt(sp.get("tzOffset") || "-330");
    const offsetMs = -tzOffset * 60 * 1000;

    let startDate: Date;
    let endDate: Date;
    if (sp.get("from") && sp.get("to")) {
      const fromDate = parseISO(sp.get("from")!.slice(0, 10));
      const toDate = parseISO(sp.get("to")!.slice(0, 10));

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

    // Single customer detail
    if (customerId) {
      const orders = await prisma.sale.findMany({
        where: { customerId, createdAt: { gte: startDate, lte: endDate }, status: { in: ["Completed", "PartialReturn"] } },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, category: true, buyingPrice: true },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      const totalSpent = orders.reduce((s, o) => s + Number(o.totalAmount), 0);
      const aov = orders.length > 0 ? totalSpent / orders.length : 0;

      let totalCost = 0;
      let totalProfit = 0;
      for (const o of orders) {
        const rev = Number(o.totalAmount);
        let cost = 0;
        for (const item of o.items) {
          const snap = Number(item.costPriceAtSale);
          const live = Number(item.product?.buyingPrice || 0);
          const unit = snap > 0 ? snap : live;
          cost += unit * Number(item.quantity);
        }
        totalCost += cost;
        totalProfit += rev - cost;
      }

      // Product frequency + profit
      const productMap = new Map<string, { name: string; category: string; qty: number; revenue: number; cost: number; profit: number }>();
      orders.forEach((o) => {
        o.items.forEach((item) => {
          const qty = Number(item.quantity);
          const revenue = Number(item.totalPrice);
          const snap = Number(item.costPriceAtSale);
          const live = Number(item.product?.buyingPrice || 0);
          const unit = snap > 0 ? snap : live;
          const cost = unit * qty;
          const existing = productMap.get(item.productId) || {
            name: item.productName,
            category: item.product?.category || "General",
            qty: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
          };
          existing.qty += qty;
          existing.revenue += revenue;
          existing.cost += cost;
          existing.profit += revenue - cost;
          productMap.set(item.productId, existing);
        });
      });
      const topProducts = Array.from(productMap.entries())
        .map(([id, v]) => ({
          id,
          ...v,
          margin: v.revenue > 0 ? Math.round((v.profit / v.revenue) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      // Category spending
      const catMap = new Map<string, number>();
      orders.forEach((o) => {
        o.items.forEach((item) => {
          const cat = item.product?.category || "General";
          catMap.set(cat, (catMap.get(cat) || 0) + Number(item.totalPrice));
        });
      });
      const categoryBreakdown = Array.from(catMap.entries()).map(([name, value]) => ({ name, value }));

      // Monthly trend (spent + profit)
      const monthMap = new Map<string, { spent: number; profit: number }>();
      orders.forEach((o) => {
        const key = `${o.createdAt.getFullYear()}-${String(o.createdAt.getMonth() + 1).padStart(2, "0")}`;
        const prev = monthMap.get(key) || { spent: 0, profit: 0 };
        const rev = Number(o.totalAmount);
        let cost = 0;
        for (const item of o.items) {
          const snap = Number(item.costPriceAtSale);
          const live = Number(item.product?.buyingPrice || 0);
          cost += (snap > 0 ? snap : live) * Number(item.quantity);
        }
        prev.spent += rev;
        prev.profit += rev - cost;
        monthMap.set(key, prev);
      });
      const monthlyTrend = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, spent: v.spent, profit: v.profit }));

      // Hourly distribution
      const hourly = Array.from({ length: 24 }, (_, h) => ({
        hour: `${String(h).padStart(2, "0")}:00`,
        count: 0,
      }));
      orders.forEach((o) => {
        hourly[new Date(o.createdAt).getHours()].count += 1;
      });

      return NextResponse.json({
        totalSpent,
        totalCost: Math.round(totalCost * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        profitMargin: totalSpent > 0 ? Math.round((totalProfit / totalSpent) * 1000) / 10 : 0,
        orderCount: orders.length,
        aov,
        topProducts,
        categoryBreakdown,
        monthlyTrend,
        hourly,
      });
    }

    // Top customers list with profit (invoice total − item costs)
    const sales = await prisma.sale.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ["Completed", "PartialReturn"] },
        customerId: { not: null },
      },
      select: {
        id: true,
        customerId: true,
        totalAmount: true,
        items: {
          select: {
            productId: true,
            quantity: true,
            costPriceAtSale: true,
          },
        },
      },
    });

    const productIds = [...new Set(sales.flatMap((s) => s.items.map((i) => i.productId)))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, buyingPrice: true },
    });
    const liveCostMap = new Map(products.map((p) => [p.id, toMoneyNumber(p.buyingPrice)]));

    type CustAgg = {
      totalSpent: number;
      cost: number;
      profit: number;
      orderCount: number;
    };
    const aggMap = new Map<string, CustAgg>();

    for (const sale of sales) {
      const cid = sale.customerId!;
      const prev = aggMap.get(cid) || { totalSpent: 0, cost: 0, profit: 0, orderCount: 0 };
      const rev = toMoneyNumber(sale.totalAmount);
      let cost = 0;
      for (const item of sale.items) {
        cost += resolveUnitCost(item.productId, item.costPriceAtSale, liveCostMap) * Number(item.quantity);
      }
      prev.totalSpent += rev;
      prev.cost += cost;
      prev.profit += rev - cost;
      prev.orderCount += 1;
      aggMap.set(cid, prev);
    }

    const ranked = [...aggMap.entries()]
      .map(([id, a]) => ({ id, ...a }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 50);

    const customerIds = ranked.map((c) => c.id);
    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true, phone: true, totalDue: true },
    });
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    const result = ranked.map((c) => {
      const info = customerMap.get(c.id);
      return {
        id: c.id,
        name: info?.name || "Unknown",
        phone: info?.phone,
        totalDue: Number(info?.totalDue || 0),
        totalSpent: roundMoney(c.totalSpent),
        cost: roundMoney(c.cost),
        profit: roundMoney(c.profit),
        margin: roundPct(marginPercent(c.totalSpent, c.profit)),
        orderCount: c.orderCount,
        aov: c.orderCount > 0 ? roundMoney(c.totalSpent / c.orderCount) : 0,
      };
    });

    return NextResponse.json({ topCustomers: result });
  } catch (error: unknown) {
    console.error("Failed to fetch customer report:", error);
    return NextResponse.json({ error: "Failed to fetch customer report" }, { status: 500 });
  }
}
