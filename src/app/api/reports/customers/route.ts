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
    const customerId = sp.get("customerId");

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

    // Single customer detail
    if (customerId) {
      const orders = await prisma.sale.findMany({
        where: { customerId, createdAt: { gte: startDate, lte: endDate }, status: "Completed" },
        include: {
          items: {
            include: { product: { select: { id: true, category: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      const totalSpent = orders.reduce((s, o) => s + Number(o.totalAmount), 0);
      const aov = orders.length > 0 ? totalSpent / orders.length : 0;

      // Product frequency
      const productMap = new Map<string, { name: string; category: string; qty: number; revenue: number }>();
      orders.forEach((o) => {
        o.items.forEach((item) => {
          const existing = productMap.get(item.productId) || {
            name: item.productName,
            category: item.product?.category || "General",
            qty: 0,
            revenue: 0,
          };
          existing.qty += item.quantity;
          existing.revenue += Number(item.totalPrice);
          productMap.set(item.productId, existing);
        });
      });
      const topProducts = Array.from(productMap.entries())
        .map(([id, v]) => ({ id, ...v }))
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

      // Monthly trend
      const monthMap = new Map<string, number>();
      orders.forEach((o) => {
        const key = `${o.createdAt.getFullYear()}-${String(o.createdAt.getMonth() + 1).padStart(2, "0")}`;
        monthMap.set(key, (monthMap.get(key) || 0) + Number(o.totalAmount));
      });
      const monthlyTrend = Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, spent]) => ({ month, spent }));

      // Hourly distribution
      const hourly = Array.from({ length: 24 }, (_, h) => ({
        hour: `${String(h).padStart(2, "0")}:00`,
        count: 0,
      }));
      orders.forEach((o) => {
        hourly[new Date(o.createdAt).getHours()].count += 1;
      });

      return NextResponse.json({ totalSpent, orderCount: orders.length, aov, topProducts, categoryBreakdown, monthlyTrend, hourly });
    }

    // Top customers list
    const topCustomers = await prisma.sale.groupBy({
      by: ["customerId"],
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: "Completed",
        customerId: { not: null },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 20,
    });

    const customerIds = topCustomers.map((c) => c.customerId!);
    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true, phone: true, totalDue: true },
    });
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    const result = topCustomers.map((c) => {
      const info = customerMap.get(c.customerId!);
      return {
        id: c.customerId!,
        name: info?.name || "Unknown",
        phone: info?.phone,
        totalDue: Number(info?.totalDue || 0),
        totalSpent: Number(c._sum.totalAmount || 0),
        orderCount: c._count.id,
        aov: c._count.id > 0 ? Number(c._sum.totalAmount || 0) / c._count.id : 0,
      };
    });

    return NextResponse.json({ topCustomers: result });
  } catch (error: unknown) {
    console.error("Failed to fetch customer report:", error);
    return NextResponse.json({ error: "Failed to fetch customer report" }, { status: 500 });
  }
}
