export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db as prisma } from "@/lib/db";
import { format, eachDayOfInterval, eachMonthOfInterval, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { requirePermission } from "@/lib/api-middleware";
import { reportSaleStatusFilter } from "@/lib/report-filters";
import { aggregateSalePayments, breakdownSalePayment } from "@/lib/sale-payment-breakdown";
import { toMoneyNumber } from "@/lib/money";

function toLocalBounds(date: Date, offsetMinutes: number): { start: Date; end: Date } {
  const offsetMs = -offsetMinutes * 60 * 1000;
  const localTime = new Date(date.getTime() + offsetMs);
  const startLocal = new Date(Date.UTC(
    localTime.getUTCFullYear(),
    localTime.getUTCMonth(),
    localTime.getUTCDate(),
    0, 0, 0, 0
  ));
  const start = new Date(startLocal.getTime() - offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

export async function GET(request: NextRequest) {
  const authResponse = await requirePermission(request, "reports.view");
  if (authResponse) return authResponse;

  try {
    const sp = request.nextUrl.searchParams;
    const isHourly = sp.get("hourly") === "true";
    const tzOffset = parseInt(sp.get("tzOffset") || "-330");
    const offsetMs = -tzOffset * 60 * 1000;
    const TZ = tzOffset === -360 ? "Asia/Dhaka" : "Asia/Kolkata";

    let startDate: Date;
    let endDate: Date;

    if (sp.get("from") && sp.get("to")) {
      startDate = toLocalBounds(parseISO(sp.get("from")!), tzOffset).start;
      endDate = toLocalBounds(parseISO(sp.get("to")!), tzOffset).end;
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

    const saleWhere = {
      createdAt: { gte: startDate, lte: endDate },
      status: reportSaleStatusFilter,
    };

    // Line items with cost snapshot for accurate profit
    const saleItems = await prisma.saleItem.findMany({
      where: {
        sale: saleWhere,
        quantity: { gt: 0 },
      },
      select: {
        productId: true,
        quantity: true,
        totalPrice: true,
        costPriceAtSale: true,
      },
    });

    const productIds = [...new Set(saleItems.map((i) => i.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, buyingPrice: true },
    });
    const liveCostMap = new Map(products.map((p) => [p.id, Number(p.buyingPrice)]));

    const unitCost = (productId: string, snap: unknown) => {
      const s = Number(snap);
      return s > 0 ? s : (liveCostMap.get(productId) || 0);
    };

    let totalRevenue = 0;
    let totalCost = 0;
    for (const i of saleItems) {
      const qty = Number(i.quantity);
      totalRevenue += toMoneyNumber(i.totalPrice);
      totalCost += unitCost(i.productId, i.costPriceAtSale) * qty;
    }
    const totalProfit = totalRevenue - totalCost;

    // Sales rows for payment breakdown + charts
    const sales = await prisma.sale.findMany({
      where: saleWhere,
      select: {
        id: true,
        createdAt: true,
        totalAmount: true,
        amountPaid: true,
        paymentMethod: true,
        cashAmount: true,
        upiAmount: true,
        status: true,
        items: {
          select: { productId: true, quantity: true, costPriceAtSale: true, totalPrice: true },
        },
      },
    });

    const salesCount = sales.length;

    // Payment: drawer cash/UPI + due created (consistent with dashboard stats)
    const payAgg = aggregateSalePayments(sales);
    const paymentBreakdown: Record<string, number> = {
      Cash: payAgg.cash,
      UPI: payAgg.upi,
      Due: payAgg.dueCreated,
    };
    // Also surface Mixed/Prepaid method totals for pie (by method label of totalAmount paid portion)
    let mixedTotal = 0;
    let prepaidTotal = 0;
    for (const s of sales) {
      const b = breakdownSalePayment(s);
      if (s.paymentMethod === "Mixed") mixedTotal += b.collected;
      if (s.paymentMethod === "Prepaid") prepaidTotal += b.paid;
    }
    if (mixedTotal > 0) paymentBreakdown.Mixed = mixedTotal;
    if (prepaidTotal > 0) paymentBreakdown.Prepaid = prepaidTotal;

    // Previous period revenue (line items)
    const periodMs = endDate.getTime() - startDate.getTime();
    const prevEnd = new Date(startDate.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - periodMs);
    const prevItems = await prisma.saleItem.findMany({
      where: {
        sale: {
          createdAt: { gte: prevStart, lte: prevEnd },
          status: reportSaleStatusFilter,
        },
        quantity: { gt: 0 },
      },
      select: { totalPrice: true },
    });
    const previousPeriodRevenue = prevItems.reduce((s, i) => s + toMoneyNumber(i.totalPrice), 0);

    let chartData: { date: string; revenue: number; profit: number; count: number }[];

    if (isHourly) {
      chartData = Array.from({ length: 24 }, (_, h) => ({
        date: String(h).padStart(2, "0") + ":00",
        revenue: 0,
        profit: 0,
        count: 0,
      }));

      for (const sale of sales) {
        const hour = toZonedTime(sale.createdAt, TZ).getHours();
        const rev = Number(sale.totalAmount);
        const cost = sale.items.reduce(
          (s, i) => s + unitCost(i.productId, i.costPriceAtSale) * Number(i.quantity),
          0,
        );
        chartData[hour].revenue += rev;
        chartData[hour].profit += rev - cost;
        chartData[hour].count += 1;
      }
    } else {
      const isYearly = parseInt(sp.get("days") || "30") === 365;
      const intervalList = isYearly
        ? eachMonthOfInterval({ start: startDate, end: endDate })
        : eachDayOfInterval({ start: startDate, end: endDate });

      const salesByDay = new Map<string, { date: string; revenue: number; profit: number; count: number }>();
      intervalList.forEach((d) => {
        const key = format(toZonedTime(d, TZ), isYearly ? "yyyy-MM" : "yyyy-MM-dd");
        salesByDay.set(key, { date: key, revenue: 0, profit: 0, count: 0 });
      });

      for (const sale of sales) {
        const key = format(toZonedTime(sale.createdAt, TZ), isYearly ? "yyyy-MM" : "yyyy-MM-dd");
        const day = salesByDay.get(key);
        if (day) {
          const rev = Number(sale.totalAmount);
          const cost = sale.items.reduce(
            (s, i) => s + unitCost(i.productId, i.costPriceAtSale) * Number(i.quantity),
            0,
          );
          day.revenue += rev;
          day.profit += rev - cost;
          day.count += 1;
        }
      }

      chartData = Array.from(salesByDay.values());
    }

    const revenueGrowth =
      previousPeriodRevenue > 0
        ? ((totalRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100
        : totalRevenue > 0
          ? 100
          : 0;

    let prevChartData: { date: string; prevRevenue: number }[] | undefined;
    if (sp.get("compare") === "true" && !isHourly) {
      const prevDayList = eachDayOfInterval({ start: prevStart, end: prevEnd });
      const prevByDay = new Map<string, number>();
      prevDayList.forEach((d) => {
        prevByDay.set(format(toZonedTime(d, TZ), "yyyy-MM-dd"), 0);
      });

      const prevDailySales = await prisma.sale.findMany({
        where: {
          createdAt: { gte: prevStart, lte: prevEnd },
          status: reportSaleStatusFilter,
        },
        select: { createdAt: true, totalAmount: true },
      });
      prevDailySales.forEach((sale) => {
        const key = format(toZonedTime(sale.createdAt, TZ), "yyyy-MM-dd");
        prevByDay.set(key, (prevByDay.get(key) || 0) + Number(sale.totalAmount));
      });

      const prevValues = Array.from(prevByDay.values());
      prevChartData = chartData.map((d, i) => ({
        date: d.date,
        prevRevenue: prevValues[i] ?? 0,
      }));
    }

    return NextResponse.json(
      {
        summary: {
          totalRevenue,
          totalProfit,
          totalSalesCount: salesCount,
          revenueGrowth: parseFloat(revenueGrowth.toFixed(2)),
          profitMargin:
            totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : "0",
          paymentBreakdown,
          collected: payAgg.collected,
          cash: payAgg.cash,
          upi: payAgg.upi,
          dueCreated: payAgg.dueCreated,
        },
        chartData,
        ...(prevChartData ? { prevChartData } : {}),
      },
      { headers: jsonHeaders },
    );
  } catch (error: unknown) {
    console.error("Failed to fetch sales report:", error);
    return NextResponse.json(
      { error: "Failed to fetch sales report", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500, headers: jsonHeaders },
    );
  }
}
