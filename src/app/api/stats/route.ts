// ড্যাশবোর্ড স্ট্যাটস প্রতি ৩০ সেকেন্ডে একবার রিফ্রেশ হবে — real-time লাগে না
export const revalidate = 30;
// ============================================================================
// Stats API Route - Lakhan Bhandar POS
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/api-middleware';

export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, 'sales.view');
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    // tzOffset = client's getTimezoneOffset() in minutes (e.g. IST = -330)
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

    // Today's sales
    const todaySales = await db.sale.findMany({
      where: {
        createdAt: {
          gte: startOfDay,
          lt: endOfDay,
        },
        status: 'Completed',
      },
      include: {
        customer: {
          select: { id: true, name: true },
        },
      },
    });

    const todaySalesTotal = todaySales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
    const todayOrdersCount = todaySales.length;
    const todayCashTotal = todaySales.reduce((sum, sale) => sum + Number(sale.cashAmount || 0), 0);
    const todayUpiTotal = todaySales.reduce((sum, sale) => sum + Number(sale.upiAmount || 0), 0);

    // Yesterday's sales
    const yesterdaySales = await db.sale.findMany({
      where: {
        createdAt: {
          gte: yesterdayStart,
          lt: startOfDay,
        },
        status: 'Completed',
      },
    });

    const yesterdaySalesTotal = yesterdaySales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
    const yesterdayOrdersCount = yesterdaySales.length;

    // Yesterday's expenses
    const yesterdayExpenses = await db.expense.findMany({
      where: {
        date: {
          gte: yesterdayStart,
          lt: startOfDay,
        },
        isActive: true,
      },
    });
    const yesterdayExpensesTotal = yesterdayExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // Total due from all customers
    const customersWithDue = await db.customer.findMany({
      where: {
        totalDue: { gt: 0 },
        isActive: true,
      },
      select: { totalDue: true },
    });
    const totalDue = customersWithDue.reduce((sum, c) => sum + Number(c.totalDue || 0), 0);

    // Low stock count - সরাসরি ডেটাবেসে filter করা, পুরো টেবিল মেমরিতে না এনে
    const lowStockProducts = await db.$queryRaw<{ id: string; name: string; nameBn: string | null; currentStock: number; minStockLevel: number }[]>`
      SELECT id, name, name_bn as "nameBn", CAST(current_stock AS FLOAT) as "currentStock", CAST(min_stock_level AS FLOAT) as "minStockLevel"
      FROM products
      WHERE is_active = true AND current_stock <= min_stock_level
      LIMIT 20
    `;

    // Recent transactions (last 10)
    const recentSales = await db.sale.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: { id: true, name: true },
        },
        items: {
          select: {
            productName: true,
            quantity: true,
            totalPrice: true,
          },
        },
      },
    });

    const recentTransactions = recentSales.map(tx => ({
      id: tx.id,
      invoiceNumber: tx.invoiceNumber,
      totalAmount: Number(tx.totalAmount || 0),
      amountPaid: Number(tx.amountPaid || 0),
      paymentMethod: tx.paymentMethod === 'Cash' ? 'নগদ' : tx.paymentMethod === 'UPI' ? 'ইউপিআই' : tx.paymentMethod === 'Mixed' ? 'মিশ্র' : 'বাকি',
      paymentStatus: tx.paymentStatus === 'Paid' ? 'সম্পন্ন' : tx.paymentStatus === 'Partial' ? 'আংশিক' : 'বাকি',
      status: tx.status === 'Completed' ? 'সম্পন্ন' : tx.status === 'Cancelled' ? 'বাতিল' : 'রিফান্ড',
      createdAt: tx.createdAt.toISOString(),
      customer: tx.customer,
      items: tx.items.map(item => ({
        productName: item.productName,
        quantity: item.quantity,
        totalPrice: Number(item.totalPrice || 0),
      })),
    }));

    // Today's expenses
    const todayExpenses = await db.expense.findMany({
      where: {
        date: {
          gte: startOfDay,
          lt: endOfDay,
        },
        isActive: true,
      },
    });
    const todayExpensesTotal = todayExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // Payment method breakdown for today
    const paymentBreakdown = {
      'নগদ': todaySales.filter(s => s.paymentMethod === 'Cash').reduce((sum, s) => sum + Number(s.totalAmount || 0), 0),
      'ইউপিআই': todaySales.filter(s => s.paymentMethod === 'UPI').reduce((sum, s) => sum + Number(s.totalAmount || 0), 0),
      'মিশ্র': todaySales.filter(s => s.paymentMethod === 'Mixed').reduce((sum, s) => sum + Number(s.totalAmount || 0), 0),
      'বাকি': todaySales.filter(s => s.paymentMethod === 'Due').reduce((sum, s) => sum + Number(s.totalAmount || 0), 0),
    };

    // Total products count
    const totalProducts = await db.product.count({
      where: { isActive: true },
    });

    // Total customers count
    const totalCustomers = await db.customer.count({
      where: { isActive: true },
    });

    // Calculate today's cost of goods sold from sale items
    const todaySaleItems = await db.saleItem.findMany({
      where: {
        sale: {
          createdAt: {
            gte: startOfDay,
            lt: endOfDay,
          },
          status: 'Completed',
        },
      },
    });

    // Get buying prices for products sold today
    const productIds = [...new Set(todaySaleItems.map(item => item.productId))];
    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, buyingPrice: true },
    });
    const productBuyingPriceMap = new Map(products.map(p => [p.id, Number(p.buyingPrice || 0)]));

    const costOfGoodsSold = todaySaleItems.reduce((sum, item) => {
      const buyingPrice = productBuyingPriceMap.get(item.productId) ?? 0;
      return sum + (buyingPrice * Number(item.quantity));
    }, 0);

    // Today's profit: sales - operating expenses (excluding supplier payments) - cost of goods sold
    const todayExpensesNonSupplier = todayExpenses
      .filter(e => e.category !== 'Supplier Payment')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const todayProfit = todaySalesTotal - todayExpensesNonSupplier - costOfGoodsSold;
    const profitMargin = todaySalesTotal > 0 ? ((todayProfit / todaySalesTotal) * 100) : 0;

    // Last 7 days sales data — use 2 bulk queries instead of 14 sequential ones
    const last7DaysSales = [];
    const day7Start = new Date(startOfDay);
    day7Start.setDate(day7Start.getDate() - 6);

    const [week7Sales, week7Expenses] = await Promise.all([
      db.sale.findMany({
        where: {
          createdAt: { gte: day7Start, lt: endOfDay },
          status: 'Completed',
        },
        select: { totalAmount: true, createdAt: true },
      }),
      db.expense.findMany({
        where: {
          date: { gte: day7Start, lt: endOfDay },
          isActive: true,
        },
        select: { amount: true, date: true },
      }),
    ]);

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

      // Format date in Bengali
      const bengaliDays = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
      const bengaliMonths = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
      const dayName = bengaliDays[dayStart.getDay()];
      const dateStr = `${dayStart.getDate().toLocaleString('bn-BD')} ${bengaliMonths[dayStart.getMonth()]}`;

      last7DaysSales.push({
        date: dateStr,
        day: dayName,
        sales: daySalesTotal,
        expenses: dayExpensesTotal,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        todaySales: todaySalesTotal,
        todayOrders: todayOrdersCount,
        todayCash: todayCashTotal,
        todayUpi: todayUpiTotal,
        todayExpenses: todayExpensesTotal,
        totalDue,
        lowStockCount: lowStockProducts.length,
        lowStockProducts: lowStockProducts.map(p => ({
          id: p.id,
          name: p.name,
          nameBn: p.nameBn || p.name,
          currentStock: Number(p.currentStock),
          minStockLevel: Number(p.minStockLevel),
        })),
        recentTransactions,
        paymentBreakdown,
        totalProducts,
        totalCustomers,
        todayProfit,
        last7DaysSales,
        profitMargin,
        yesterdaySales: yesterdaySalesTotal,
        yesterdayOrders: yesterdayOrdersCount,
        yesterdayExpenses: yesterdayExpensesTotal,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
