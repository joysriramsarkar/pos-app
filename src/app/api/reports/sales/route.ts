export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db as prisma } from "@/lib/db";
import { format, eachDayOfInterval, parseISO, subDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { requirePermission } from "@/lib/api-middleware";

const TZ = "Asia/Kolkata";

function toISTBounds(date: Date): { start: Date; end: Date } {
  const zoned = toZonedTime(date, TZ);
  const start = new Date(Date.UTC(
    zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), 0, 0, 0, 0
  ) - 5.5 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

export async function GET(request: NextRequest) {
  const authResponse = await requirePermission(request, "reports.view");
  if (authResponse) return authResponse;

  try {
    const sp = request.nextUrl.searchParams;
    const isHourly = sp.get("hourly") === "true";

    let startDate: Date;
    let endDate: Date;

    if (sp.get("from") && sp.get("to")) {
      startDate = toISTBounds(parseISO(sp.get("from")!)).start;
      endDate = toISTBounds(parseISO(sp.get("to")!)).end;
    } else {
      const days = parseInt(sp.get("days") || "30");
      const now = toZonedTime(new Date(), TZ);
      startDate = toISTBounds(subDays(now, days - 1)).start;
      endDate = toISTBounds(now).end;
    }

    // Aggregate totals directly in DB — no in-memory loops over all sales
    const [salesAgg, paymentAgg, salesCount] = await Promise.all([
      prisma.saleItem.aggregate({
        where: {
          sale: { createdAt: { gte: startDate, lte: endDate }, status: "Completed" },
        },
        _sum: { totalPrice: true, quantity: true },
      }),
      prisma.sale.groupBy({
        by: ["paymentMethod"],
        where: { createdAt: { gte: startDate, lte: endDate }, status: "Completed" },
        _sum: { totalAmount: true },
      }),
      prisma.sale.count({
        where: { createdAt: { gte: startDate, lte: endDate }, status: "Completed" },
      }),
    ]);

    // Profit requires cost — fetch per-product aggregated cost from DB
    const costAgg = await prisma.saleItem.findMany({
      where: {
        sale: { createdAt: { gte: startDate, lte: endDate }, status: "Completed" },
      },
      select: { productId: true, quantity: true },
    });

    const productIds = [...new Set(costAgg.map((i) => i.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, buyingPrice: true },
    });
    const costMap = new Map(products.map((p) => [p.id, Number(p.buyingPrice)]));
    const totalCost = costAgg.reduce(
      (sum, i) => sum + (costMap.get(i.productId) || 0) * i.quantity,
      0
    );

    const totalRevenue = Number(salesAgg._sum.totalPrice || 0);
    const totalProfit = totalRevenue - totalCost;

    // Previous period for growth
    const periodMs = endDate.getTime() - startDate.getTime();
    const prevEnd = new Date(startDate.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - periodMs);
    const prevAgg = await prisma.saleItem.aggregate({
      where: {
        sale: { createdAt: { gte: prevStart, lte: prevEnd }, status: "Completed" },
      },
      _sum: { totalPrice: true },
    });
    const previousPeriodRevenue = Number(prevAgg._sum.totalPrice || 0);

    const paymentBreakdown: Record<string, number> = {};
    paymentAgg.forEach((p) => {
      paymentBreakdown[p.paymentMethod] = Number(p._sum.totalAmount || 0);
    });

    // Chart data — use DB groupBy for daily, minimal fetch for hourly
    let chartData: { date: string; revenue: number; profit: number; count: number }[];

    if (isHourly) {
      const hourlySales = await prisma.sale.findMany({
        where: { createdAt: { gte: startDate, lte: endDate }, status: "Completed" },
        select: { createdAt: true, totalAmount: true, items: { select: { productId: true, quantity: true } } },
      });

      chartData = Array.from({ length: 24 }, (_, h) => ({
        date: String(h).padStart(2, "0") + ":00",
        revenue: 0,
        profit: 0,
        count: 0,
      }));

      hourlySales.forEach((sale) => {
        const hour = toZonedTime(sale.createdAt, TZ).getHours();
        const cost = sale.items.reduce(
          (s, i) => s + (costMap.get(i.productId) || 0) * i.quantity,
          0
        );
        chartData[hour].revenue += Number(sale.totalAmount);
        chartData[hour].profit += Number(sale.totalAmount) - cost;
        chartData[hour].count += 1;
      });
    } else {
      const dailyAgg = await prisma.sale.groupBy({
        by: ["createdAt"],
        where: { createdAt: { gte: startDate, lte: endDate }, status: "Completed" },
        _sum: { totalAmount: true },
        _count: { id: true },
      });

      // Build day map from interval
      const dayList = eachDayOfInterval({ start: startDate, end: endDate });
      const salesByDay = new Map<string, { date: string; revenue: number; profit: number; count: number }>();
      dayList.forEach((d) => {
        const key = format(toZonedTime(d, TZ), "yyyy-MM-dd");
        salesByDay.set(key, { date: key, revenue: 0, profit: 0, count: 0 });
      });

      // For daily profit we need per-day cost — fetch minimal data
      const dailySales = await prisma.sale.findMany({
        where: { createdAt: { gte: startDate, lte: endDate }, status: "Completed" },
        select: { createdAt: true, totalAmount: true, items: { select: { productId: true, quantity: true } } },
      });

      dailySales.forEach((sale) => {
        const key = format(toZonedTime(sale.createdAt, TZ), "yyyy-MM-dd");
        const day = salesByDay.get(key);
        if (day) {
          const cost = sale.items.reduce(
            (s, i) => s + (costMap.get(i.productId) || 0) * i.quantity,
            0
          );
          day.revenue += Number(sale.totalAmount);
          day.profit += Number(sale.totalAmount) - cost;
          day.count += 1;
        }
      });

      chartData = Array.from(salesByDay.values());
    }

    const revenueGrowth =
      previousPeriodRevenue > 0
        ? ((totalRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100
        : totalRevenue > 0
          ? 100
          : 0;

    return NextResponse.json({
      summary: {
        totalRevenue,
        totalProfit,
        totalSalesCount: salesCount,
        revenueGrowth: parseFloat(revenueGrowth.toFixed(2)),
        profitMargin:
          totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : "0",
        paymentBreakdown,
      },
      chartData,
    });
  } catch (error: unknown) {
    console.error("Failed to fetch sales report:", error);
    return NextResponse.json(
      { error: "Failed to fetch sales report", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
