export const dynamic = 'force-dynamic';
export const revalidate = 0;
// ============================================================================
// Stats API Route - Lakhan Bhandar POS
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireBusinessContext, checkPermission } from '@/lib/tenant';
import { aggregateSalePayments } from '@/lib/sale-payment-breakdown';

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
};

export async function GET(request: NextRequest) {
  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, 'sales.view');
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    const { searchParams } = new URL(request.url);
    const tzOffset = parseInt(searchParams.get('tzOffset') ?? '0', 10);

    // Calculate local midnight in UTC
    const nowUtc = Date.now();
    const localNow = new Date(nowUtc - tzOffset * 60 * 1000);
    localNow.setUTCHours(0, 0, 0, 0);
    const startOfDay = new Date(localNow.getTime() + tzOffset * 60 * 1000);

    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const yesterdayStart = new Date(startOfDay);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const day7Start = new Date(startOfDay);
    day7Start.setDate(day7Start.getDate() - 6);

    // Run ALL independent queries concurrently to prevent worker CPU/execution timeouts
    // Run queries sequentially or in small batches to prevent Edge Worker memory exhaustion (128MB limit)
    // 1. Today's sales (explicit select to avoid shift_id, in-memory filter to avoid SaleStatus enum cast)
    const todaySales = await db.sale
      .findMany({
        where: {
          businessId,
          createdAt: { gte: startOfDay, lt: endOfDay },
        },
        select: {
          id: true,
          totalAmount: true,
          amountPaid: true,
          cashAmount: true,
          upiAmount: true,
          paymentMethod: true,
          status: true,
          createdAt: true,
          customer: { select: { id: true, name: true } },
        },
      })
      .then((sales) =>
        sales.filter((s) => {
          const st = String(s.status);
          return st === 'COMPLETED' || st === 'PARTIAL_RETURN';
        })
      )
      .catch((err) => {
        console.warn('[stats] todaySales error:', err);
        return [];
      });

    // 2. Yesterday's sales
    const yesterdaySales = await db.sale
      .findMany({
        where: {
          businessId,
          createdAt: { gte: yesterdayStart, lt: startOfDay },
        },
        select: {
          id: true,
          totalAmount: true,
          status: true,
        },
      })
      .then((sales) => sales.filter((s) => String(s.status) === 'COMPLETED'))
      .catch(() => []);

    // 3. Yesterday's expenses
    const yesterdayExpenses = await db.expense.findMany({
      where: {
        businessId,
        date: { gte: yesterdayStart, lt: startOfDay },
        isActive: true,
      },
    }).catch(() => []);

    // 4. Customers with due
    const customersWithDue = await db.customer.findMany({
      where: { businessId, totalDue: { gt: 0 }, isActive: true },
      select: { totalDue: true },
    }).catch(() => []);

    // 5. Low stock products
    const lowStockProducts = await db.$queryRaw<{
      id: string;
      name: string;
      nameBn: string | null;
      currentStock: number;
      minStockLevel: number;
      soldLast7: number;
    }[]>`
      SELECT id, name, name_bn as "nameBn",
             CAST(current_stock AS FLOAT) as "currentStock",
             CAST(min_stock_level AS FLOAT) as "minStockLevel",
             0 as "soldLast7"
      FROM products
      WHERE business_id = ${businessId}
        AND is_active = true
        AND current_stock <= min_stock_level
      ORDER BY current_stock ASC
      LIMIT 20
    `.catch(() => []);

    // 6. Recent transactions (explicit select to avoid shift_id)
    const recentSales = await db.sale
      .findMany({
        where: { businessId },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          amountPaid: true,
          paymentMethod: true,
          paymentStatus: true,
          status: true,
          createdAt: true,
          customer: { select: { id: true, name: true } },
          user: { select: { id: true, name: true, username: true } },
          items: {
            select: {
              productName: true,
              quantity: true,
              totalPrice: true,
            },
          },
        },
      })
      .catch((err) => {
        console.warn('[stats] recentSales error:', err);
        return [];
      });

    // 7. Today's expenses
    const todayExpenses = await db.expense.findMany({
      where: {
        businessId,
        date: { gte: startOfDay, lt: endOfDay },
        isActive: true,
      },
    }).catch(() => []);

    // 8. Total products count
    const totalProducts = await db.product.count({ where: { businessId, isActive: true } }).catch(() => 0);

    // 9. Total customers count
    const totalCustomers = await db.customer.count({ where: { businessId, isActive: true } }).catch(() => 0);

    // 10. Today's sale items
    const todaySaleItems = await db.saleItem.findMany({
      where: {
        sale: {
          businessId,
          createdAt: { gte: startOfDay, lt: endOfDay },
          status: { in: ['COMPLETED', 'PARTIAL_RETURN'] },
        },
        quantity: { gt: 0 },
      },
      select: {
        productId: true,
        quantity: true,
        costPriceAtSale: true,
      },
    }).catch(() => []);

    // 11. Week 7 sales
    const week7Sales = await db.sale.findMany({
      where: {
        businessId,
        createdAt: { gte: day7Start, lt: endOfDay },
        status: { in: ['COMPLETED', 'PARTIAL_RETURN'] },
      },
      select: { totalAmount: true, createdAt: true },
    }).catch(() => []);

    // 12. Week 7 expenses
    const week7Expenses = await db.expense.findMany({
      where: {
        businessId,
        date: { gte: day7Start, lt: endOfDay },
        isActive: true,
      },
      select: { amount: true, date: true },
    }).catch(() => []);

    // Aggregate today's sales
    const todayAgg = aggregateSalePayments(todaySales);
    const todaySalesTotal = todayAgg.salesTotal;
    const todayOrdersCount = todayAgg.orders;
    const todayCashTotal = todayAgg.cash;
    const todayUpiTotal = todayAgg.upi;
    const todayDueCreated = todayAgg.dueCreated;
    const todayCollected = todayAgg.collected;

    // Yesterday totals
    const yesterdaySalesTotal = yesterdaySales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
    const yesterdayOrdersCount = yesterdaySales.length;
    const yesterdayExpensesTotal = yesterdayExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // Total due
    const totalDue = customersWithDue.reduce((sum, c) => sum + Number(c.totalDue || 0), 0);

    // Format recent transactions
    const recentTransactions = recentSales.map(tx => ({
      id: tx.id,
      invoiceNumber: tx.invoiceNumber,
      totalAmount: Number(tx.totalAmount || 0),
      amountPaid: Number(tx.amountPaid || 0),
      paymentMethod: tx.paymentMethod || 'CASH',
      paymentMethodLabel:
        tx.paymentMethod === 'CASH' ? 'নগদ'
        : tx.paymentMethod === 'UPI' ? 'ইউপিআই'
        : tx.paymentMethod === 'MIXED' ? 'মিশ্র'
        : tx.paymentMethod === 'PREPAID' ? 'প্রিপেইড'
        : 'বাকি',
      paymentStatus: tx.paymentStatus || 'PAID',
      status: tx.status || 'COMPLETED',
      createdAt: tx.createdAt.toISOString(),
      customer: tx.customer,
      user: tx.user,
      items: tx.items.map(item => ({
        productName: item.productName,
        quantity: item.quantity,
        totalPrice: Number(item.totalPrice || 0),
      })),
    }));

    // Today's expenses total
    const todayExpensesTotal = todayExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // Payment breakdown
    const paymentBreakdown = {
      'নগদ': todayCashTotal,
      'ইউপিআই': todayUpiTotal,
      'মিশ্র': todaySales
        .filter((s) => s.paymentMethod === 'MIXED')
        .reduce((sum, s) => sum + Number(s.totalAmount || 0), 0),
      'বাকি': todayDueCreated,
    };

    // Reconciliation
    const reconciliation = {
      salesTotal: todaySalesTotal,
      cashInDrawer: todayCashTotal,
      upiCollected: todayUpiTotal,
      collected: todayCollected,
      dueCreated: todayDueCreated,
      expenses: todayExpensesTotal,
      expectedCashAfterExpenses: todayCashTotal - todayExpensesTotal,
    };

    // COGS calculation
    const productIds = [...new Set(todaySaleItems.map(item => item.productId))];
    let productBuyingPriceMap = new Map<string, number>();
    if (productIds.length > 0) {
      const prods = await db.product.findMany({
        where: { businessId, id: { in: productIds } },
        select: { id: true, buyingPrice: true },
      }).catch(() => []);
      productBuyingPriceMap = new Map(prods.map(p => [p.id, Number(p.buyingPrice || 0)]));
    }

    const costOfGoodsSold = todaySaleItems.reduce((sum, item) => {
      const snap = Number(item.costPriceAtSale);
      const unitCost = snap > 0 ? snap : (productBuyingPriceMap.get(item.productId) ?? 0);
      return sum + (unitCost * Number(item.quantity));
    }, 0);

    const todayExpensesNonSupplier = todayExpenses
      .filter(e => e.category !== 'Supplier Payment')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const todayProfit = todaySalesTotal - todayExpensesNonSupplier - costOfGoodsSold;
    const profitMargin = todaySalesTotal > 0 ? ((todayProfit / todaySalesTotal) * 100) : 0;

    // Week 7 breakdown
    const last7DaysSales = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(startOfDay);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const daySalesTotal = week7Sales
        .filter(s => s.createdAt >= dayStart && s.createdAt < dayEnd)
        .reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
      const dayExpensesTotal = week7Expenses
        .filter(e => e.date >= dayStart && e.date < dayEnd)
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const bengaliDays = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
      const bengaliMonths = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
      const dayName = bengaliDays[dayStart.getDay()];
      const dateStr = `${dayStart.getDate().toLocaleString('bn-BD')} ${bengaliMonths[dayStart.getMonth()]}`;

      last7DaysSales.push({
        date: dateStr,
        day: dayName,
        rawDate: dayStart.toISOString(),
        sales: daySalesTotal,
        expenses: dayExpensesTotal,
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          todaySales: todaySalesTotal,
          todayOrders: todayOrdersCount,
          todayExpenses: todayExpensesTotal,
          yesterdaySales: yesterdaySalesTotal,
          yesterdayOrders: yesterdayOrdersCount,
          yesterdayExpenses: yesterdayExpensesTotal,
          totalDue,
          totalProducts,
          totalCustomers,
          todayProfit,
          costOfGoodsSold,
          profitMargin: Math.round(profitMargin * 10) / 10,
          paymentBreakdown,
          reconciliation,
          last7DaysSales,
          lowStockProducts,
          recentTransactions,
        },
      },
      { headers: jsonHeaders }
    );
  } catch (error) {
    console.error('Error in stats route:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dashboard statistics' },
      { status: 500, headers: jsonHeaders }
    );
  }
}
