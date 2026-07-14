export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// Helper: convert number to Bengali digits
function toBnNum(n: number | string): string {
  const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(n).replace(/\d/g, (d) => bengaliDigits[parseInt(d)]);
}

// Helper: format date in Bengali
function formatBengaliDate(date: Date): string {
  const bengaliMonths = [
    'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
    'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
  ];
  const bengaliDays = [
    'রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার',
  ];

  const day = bengaliDays[date.getDay()];
  const d = toBnNum(date.getDate());
  const m = bengaliMonths[date.getMonth()];
  const y = toBnNum(date.getFullYear());

  return `${d} ${m} ${y}, ${day}`;
}

// GET /api/daily-summary - Comprehensive daily closing report
export async function GET() {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const yesterdayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const yesterdayEnd = startOfDay;

    // Bengali formatted date
    const bengaliDate = formatBengaliDate(today);

    // ---- SALES SUMMARY ----
    const todaySales = await db.sale.findMany({
      where: {
        createdAt: { gte: startOfDay, lt: endOfDay },
        status: { notIn: ['Cancelled', 'Refunded'] },
      },
    });

    const totalSalesAmount = todaySales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
    const totalSalesCount = todaySales.length;
    const avgOrderValue = totalSalesCount > 0 ? totalSalesAmount / totalSalesCount : 0;

    // ---- PAYMENT METHOD BREAKDOWN ----
    const paymentBreakdown = {
      নগদ: { amount: 0, count: 0 },
      ইউপিআই: { amount: 0, count: 0 },
      মিশ্র: { amount: 0, count: 0 },
      বাকি: { amount: 0, count: 0 },
    };

    for (const sale of todaySales) {
      const method = sale.paymentMethod;
      let bnMethod: 'নগদ' | 'ইউপিআই' | 'মিশ্র' | 'বাকি' = 'নগদ';
      if (method === 'Cash') bnMethod = 'নগদ';
      else if (method === 'UPI') bnMethod = 'ইউপিআই';
      else if (method === 'Mixed') bnMethod = 'মিশ্র';
      else if (method === 'Due' || method === 'Prepaid') bnMethod = 'বাকি';

      if (paymentBreakdown[bnMethod]) {
        paymentBreakdown[bnMethod].amount += Number(Number(sale.totalAmount));
        paymentBreakdown[bnMethod].count += 1;
      }
    }

    // ---- PURCHASES ----
    const todayPurchases = await db.purchase.findMany({
      where: {
        createdAt: { gte: startOfDay, lt: endOfDay },
        paymentStatus: 'Paid',
      },
    });
    const totalPurchasesAmount = todayPurchases.reduce((sum, p) => sum + Number(p.totalAmount), 0);

    // ---- EXPENSES ----
    const todayExpenses = await db.expense.findMany({
      where: {
        date: { gte: startOfDay, lt: endOfDay },
        isActive: true,
      },
    });

    const totalExpenses = todayExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    // Expense category breakdown
    const expenseByCategory: Record<string, number> = {};
    for (const expense of todayExpenses) {
      const cat = expense.category || 'অন্যান্য';
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(Number(expense.amount));
    }

    // ---- COST OF GOODS SOLD ----
    const todaySaleItems = await db.saleItem.findMany({
      where: {
        sale: {
          createdAt: { gte: startOfDay, lt: endOfDay },
          status: { notIn: ['Cancelled', 'Refunded'] },
        },
      },
    });

    const productIds = [...new Set(todaySaleItems.map((item) => item.productId))];
    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, buyingPrice: true },
    });
    const productBuyingPriceMap = new Map(products.map((p) => [p.id, Number(p.buyingPrice)]));

    const costOfGoodsSold = todaySaleItems.reduce((sum, item) => {
      const buyingPrice = productBuyingPriceMap.get(item.productId) ?? 0;
      return sum + buyingPrice * Number(item.quantity);
    }, 0);

    // ---- PROFIT ----
    const grossProfit = totalSalesAmount - costOfGoodsSold;
    const totalExpensesNonSupplier = todayExpenses
      .filter((e) => e.category !== 'Supplier Payment')
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const netProfit = grossProfit - totalExpensesNonSupplier;

    // ---- DUE COLLECTION ----
    // Dues created today: difference between totalAmount and amountPaid on Due/Partial sales
    const salesWithDue = todaySales.filter(
      (s) => s.paymentMethod === 'Due' || Number(s.amountPaid) < Number(s.totalAmount)
    );
    const newDuesCreated = salesWithDue.reduce(
      (sum, s) => sum + (Number(s.totalAmount) - Number(s.amountPaid)),
      0
    );

    // Dues collected today: Sum of all 'debit' ledger entries created today (both manual and checkout payments)
    const todayDebitLedger = await db.ledgerEntry.findMany({
      where: {
        entryType: 'debit',
        createdAt: { gte: startOfDay, lt: endOfDay },
      },
      select: { amount: true },
    });
    const duesCollected = todayDebitLedger.reduce((sum, entry) => sum + Number(entry.amount), 0);

    // ---- TOP 5 SELLING PRODUCTS ----
    const productSalesMap: Record<string, { name: string; nameBn: string; quantity: number; revenue: number }> = {};

    for (const item of todaySaleItems) {
      if (!productSalesMap[item.productId]) {
        productSalesMap[item.productId] = {
          name: item.productName,
          nameBn: item.productName,
          quantity: 0,
          revenue: 0,
        };
        const fullProduct = await db.product.findUnique({
          where: { id: item.productId },
          select: { nameBn: true },
        });
        if (fullProduct?.nameBn) {
          productSalesMap[item.productId].nameBn = fullProduct.nameBn;
        }
      }
      productSalesMap[item.productId].quantity += Number(item.quantity);
      productSalesMap[item.productId].revenue += Number(Number(item.totalPrice));
    }

    const topProducts = Object.values(productSalesMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // ---- LOW STOCK ALERTS ----
    const allActiveProducts = await db.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        nameBn: true,
        currentStock: true,
        minStockLevel: true,
      },
    });
    const lowStockProducts = allActiveProducts.filter((p) => Number(p.currentStock) <= Number(p.minStockLevel));
    const outOfStockProducts = allActiveProducts.filter((p) => Number(p.currentStock) === 0);

    // ---- CUSTOMER DUES SUMMARY ----
    const customersWithDue = await db.customer.findMany({
      where: { totalDue: { gt: 0 }, isActive: true },
      select: { id: true, name: true, totalDue: true },
    });
    const totalCustomerDues = customersWithDue.reduce((sum, c) => sum + Number(c.totalDue), 0);

    // ---- OPENING / CLOSING BALANCE ----
    // Yesterday cash and upi totals
    const yesterdaySales = await db.sale.findMany({
      where: {
        createdAt: { gte: yesterdayStart, lt: yesterdayEnd },
        status: { notIn: ['Cancelled', 'Refunded'] },
      },
    });
    const yesterdayCashTotal = yesterdaySales.reduce((sum, s) => sum + Number(s.cashAmount || 0), 0);
    const yesterdayUpiTotal = yesterdaySales.reduce((sum, s) => sum + Number(s.upiAmount || 0), 0);

    const yesterdayExpenses = await db.expense.findMany({
      where: { date: { gte: yesterdayStart, lt: yesterdayEnd }, isActive: true },
    });
    const yesterdayExpensesTotal = yesterdayExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    // Opening balance
    const openingBalance = yesterdayCashTotal + yesterdayUpiTotal - yesterdayExpensesTotal;

    // Today's cash and UPI
    const todayCashTotal = todaySales.reduce((sum, s) => sum + Number(s.cashAmount || 0), 0);
    const todayUpiTotal = todaySales.reduce((sum, s) => sum + Number(s.upiAmount || 0), 0);

    // Closing balance
    const closingBalance = openingBalance + todayCashTotal + todayUpiTotal - totalExpenses;

    return NextResponse.json({
      success: true,
      data: {
        date: bengaliDate,
        totalSalesAmount,
        totalSalesCount,
        avgOrderValue,
        paymentBreakdown,
        totalExpenses,
        totalPurchasesAmount,
        expenseByCategory,
        costOfGoodsSold,
        grossProfit,
        netProfit,
        duesCollected,
        newDuesCreated,
        topProducts,
        lowStockCount: lowStockProducts.length,
        outOfStockCount: outOfStockProducts.length,
        lowStockProducts: lowStockProducts.slice(0, 10).map((p) => ({
          id: p.id,
          name: p.name,
          nameBn: p.nameBn || p.name,
          currentStock: Number(p.currentStock),
          minStockLevel: Number(p.minStockLevel),
        })),
        totalCustomerDues,
        customersWithDueCount: customersWithDue.length,
        openingBalance,
        closingBalance,
        todayCashTotal,
        todayUpiTotal,
      },
    });
  } catch (error) {
    console.error('দৈনিক সারাংশ লোড করতে ত্রুটি:', error);
    return NextResponse.json(
      { success: false, error: 'দৈনিক সারাংশ লোড করতে ত্রুটি হয়েছে' },
      { status: 500 }
    );
  }
}
