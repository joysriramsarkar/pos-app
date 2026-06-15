export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db as prisma } from "@/lib/db";
import { format, eachDayOfInterval, parseISO, subDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { requirePermission } from "@/lib/api-middleware";

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

    // Fetch all purchase orders in this range
    const purchases = await prisma.purchase.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: {
              select: { id: true, name: true, nameBn: true, unit: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch Supplies category expenses in this range (cash-paid stock purchases)
    const suppliesExpenses = await prisma.expense.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        category: "Supplies",
        isActive: true,
      },
      include: {
        supplier: true,
      },
    });

    // Fetch Supplier Payments in this range (to calculate payments done)
    const paymentExpenses = await prisma.expense.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        category: "Supplier Payment",
        isActive: true,
      },
    });

    // Calculations for Summary
    const totalOrdersCount = purchases.length;
    const pendingOrdersCount = purchases.filter(p => p.paymentStatus === 'Pending').length;
    const orderedOrdersCount = purchases.filter(p => p.paymentStatus === 'Ordered').length;
    const receivedOrdersCount = purchases.filter(p => p.paymentStatus === 'Paid').length;
    const cancelledOrdersCount = purchases.filter(p => p.paymentStatus === 'Cancelled').length;

    const receivedPurchasesAmount = purchases
      .filter(p => p.paymentStatus === 'Paid')
      .reduce((sum, p) => sum + Number(p.totalAmount), 0);

    const suppliesPurchasesAmount = suppliesExpenses
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const totalPurchasesAmount = receivedPurchasesAmount + suppliesPurchasesAmount;

    // Supplier Payment expenses + Supplies expenses (which are immediate cash payments)
    const totalPaymentsAmount = paymentExpenses.reduce((sum, e) => sum + Number(e.amount), 0) + suppliesPurchasesAmount;

    // Chart Data
    let chartData: { date: string; amount: number; count: number }[] = [];

    if (isHourly) {
      const chartMap = Array.from({ length: 24 }, (_, h) => ({
        date: String(h).padStart(2, "0") + ":00",
        amount: 0,
        count: 0,
      }));

      purchases.forEach((p) => {
        if (p.paymentStatus === 'Paid') {
          const hour = toZonedTime(p.createdAt, TZ).getHours();
          chartMap[hour].amount += Number(p.totalAmount);
          chartMap[hour].count += 1;
        }
      });

      suppliesExpenses.forEach((e) => {
        const hour = toZonedTime(e.date, TZ).getHours();
        chartMap[hour].amount += Number(e.amount);
        chartMap[hour].count += 1;
      });

      chartData = chartMap;
    } else {
      const dayList = eachDayOfInterval({ start: startDate, end: endDate });
      const dailyMap = new Map<string, { date: string; amount: number; count: number }>();
      dayList.forEach((d) => {
        const key = format(toZonedTime(d, TZ), "yyyy-MM-dd");
        dailyMap.set(key, { date: key, amount: 0, count: 0 });
      });

      purchases.forEach((p) => {
        if (p.paymentStatus === 'Paid') {
          const key = format(toZonedTime(p.createdAt, TZ), "yyyy-MM-dd");
          const day = dailyMap.get(key);
          if (day) {
            day.amount += Number(p.totalAmount);
            day.count += 1;
          }
        }
      });

      suppliesExpenses.forEach((e) => {
        const key = format(toZonedTime(e.date, TZ), "yyyy-MM-dd");
        const day = dailyMap.get(key);
        if (day) {
          day.amount += Number(e.amount);
          day.count += 1;
        }
      });

      chartData = Array.from(dailyMap.values());
    }

    // Top Suppliers calculation
    const supplierMap = new Map<string, { id: string; name: string; orderCount: number; totalAmount: number }>();

    purchases.forEach((p) => {
      if (p.paymentStatus === 'Paid') {
        const supId = p.supplierId || "none";
        const supName = p.supplier?.name || "সাপ্লায়ার ছাড়া";
        const existing = supplierMap.get(supId) || { id: supId, name: supName, orderCount: 0, totalAmount: 0 };
        existing.orderCount += 1;
        existing.totalAmount += Number(p.totalAmount);
        supplierMap.set(supId, existing);
      }
    });

    suppliesExpenses.forEach((e) => {
      const supId = e.supplierId || "none";
      const supName = e.supplier?.name || e.supplierName || "সাপ্লায়ার ছাড়া";
      const existing = supplierMap.get(supId) || { id: supId, name: supName, orderCount: 0, totalAmount: 0 };
      existing.orderCount += 1;
      existing.totalAmount += Number(e.amount);
      supplierMap.set(supId, existing);
    });

    const topSuppliers = Array.from(supplierMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount);

    // Top Products aggregation
    const productMap = new Map<string, { id: string; name: string; nameBn: string | null; quantity: number; totalSpent: number; avgPrice: number }>();

    purchases.forEach((p) => {
      if (p.paymentStatus === 'Paid') {
        p.items.forEach((item) => {
          const prodId = item.productId;
          const prodName = item.product?.name || item.productName || "Unknown Product";
          const prodNameBn = item.product?.nameBn || null;
          const qty = Number(item.quantity);
          const totalSpent = Number(item.totalPrice);
          const existing = productMap.get(prodId) || { id: prodId, name: prodName, nameBn: prodNameBn, quantity: 0, totalSpent: 0, avgPrice: 0 };
          existing.quantity += qty;
          existing.totalSpent += totalSpent;
          productMap.set(prodId, existing);
        });
      }
    });

    const topProducts = Array.from(productMap.values()).map((p) => ({
      ...p,
      avgPrice: p.quantity > 0 ? p.totalSpent / p.quantity : 0,
    })).sort((a, b) => b.totalSpent - a.totalSpent);

    return NextResponse.json({
      success: true,
      summary: {
        totalOrdersCount,
        pendingOrdersCount,
        orderedOrdersCount,
        receivedOrdersCount,
        cancelledOrdersCount,
        receivedPurchasesAmount,
        suppliesPurchasesAmount,
        totalPurchasesAmount,
        totalPaymentsAmount,
      },
      chartData,
      topSuppliers,
      topProducts,
    });

  } catch (error: unknown) {
    console.error("Failed to fetch purchases report:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch purchases report", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
