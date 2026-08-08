export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/api-middleware';
import { toMoneyNumber } from '@/lib/money';

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
export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, 'reports.view');
  if (authError) return authError;

  try {
    // ---- TIMEZONE-AWARE DATE WINDOW ----
    // tzOffset = new Date().getTimezoneOffset() from the client.
    // For IST (UTC+5:30), getTimezoneOffset() returns -330.
    // We convert UTC 'now' to local time, extract the local date,
    // then build UTC boundaries that correspond to local midnight–midnight.
    const tzOffset = parseInt(request.nextUrl.searchParams.get('tzOffset') || '-330');
    // offsetMs is the milliseconds to ADD to UTC to get local time.
    // getTimezoneOffset() returns -(UTC offset in minutes), so negate it.
    const offsetMs = -tzOffset * 60 * 1000;

    // Local "now" expressed as a UTC Date (i.e. wall-clock local time)
    const localNow = new Date(Date.now() + offsetMs);

    // Local midnight in UTC → this is when the local day starts in UTC terms
    const startOfDay = new Date(
      Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) - offsetMs,
    );
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    // Bengali date uses local time
    const bengaliDate = formatBengaliDate(localNow);

    // ---- SALES SUMMARY ----
    // Include Completed + PartialReturn; exclude Cancelled and fully refunded originals.
    // Legacy negative refund invoices (status Refunded, totalAmount < 0) are applied as offsets.
    const todaySalesRaw = await db.sale.findMany({
      where: {
        createdAt: { gte: startOfDay, lt: endOfDay },
        status: { notIn: ['Cancelled'] },
      },
    });

    const todaySaleIds = todaySalesRaw
      .filter((s) => s.status === 'Completed' || s.status === 'PartialReturn')
      .map((s) => s.id);

    const returnsToday = await db.saleReturn.findMany({
      where: {
        OR: [
          { createdAt: { gte: startOfDay, lt: endOfDay } },
          { saleId: { in: todaySaleIds } },
        ],
      },
      select: { saleId: true, refundAmount: true, createdAt: true, refundMethod: true },
    });

    // Net refund amount per original sale (SaleReturn records)
    const refundBySaleId = returnsToday.reduce<Record<string, number>>((acc, r) => {
      acc[r.saleId] = (acc[r.saleId] || 0) + toMoneyNumber(r.refundAmount);
      return acc;
    }, {});

    // Active sales for breakdown (Completed / PartialReturn net of returns)
    const todaySales = todaySalesRaw.filter(
      (s) => s.status === 'Completed' || s.status === 'PartialReturn',
    );

    // Legacy negative refund sales created today
    const legacyRefundOffset = todaySalesRaw
      .filter((s) => s.status === 'Refunded' && Number(s.totalAmount) < 0)
      .reduce((sum, s) => sum + Number(s.totalAmount), 0);

    const grossSalesAmount = todaySales.reduce((sum, s) => {
      const net = Number(s.totalAmount) - (refundBySaleId[s.id] || 0);
      return sum + Math.max(0, net);
    }, 0);
    // legacyRefundOffset is negative; adding it reduces total
    const totalSalesAmount = grossSalesAmount + legacyRefundOffset;
    const totalSalesCount = todaySales.length;
    const avgOrderValue = totalSalesCount > 0 ? totalSalesAmount / totalSalesCount : 0;

    const paymentBreakdown: Record<string, { amount: number; count: number }> = {
      নগদ: { amount: 0, count: 0 },
      ইউপিআই: { amount: 0, count: 0 },
      মিশ্র: { amount: 0, count: 0 },
      বাকি: { amount: 0, count: 0 },
    };

    for (const sale of todaySales) {
      const method = sale.paymentMethod;
      const totalAmt = Number(Number(sale.totalAmount));
      
      if (method === 'Mixed' || (sale.cashAmount != null && sale.upiAmount != null)) {
        paymentBreakdown['মিশ্র'].amount += totalAmt;
        paymentBreakdown['মিশ্র'].count += 1;
      } else {
        let bnMethod: 'নগদ' | 'ইউপিআই' | 'বাকি' = 'নগদ';
        if (method === 'Cash') bnMethod = 'নগদ';
        else if (method === 'UPI') bnMethod = 'ইউপিআই';
        else if (method === 'Due' || method === 'Prepaid') bnMethod = 'বাকি';

        if (paymentBreakdown[bnMethod]) {
          paymentBreakdown[bnMethod].amount += totalAmt;
          paymentBreakdown[bnMethod].count += 1;
        }
      }
    }

    // ---- PURCHASES ----
    // Include both formal purchases (all statuses) and informal manual stock entries
    const todayPurchases = await db.purchase.findMany({
      where: {
        createdAt: { gte: startOfDay, lt: endOfDay },
      },
    });
    const totalPurchasesAmountFromSupplier = todayPurchases.reduce((sum, p) => sum + Number(p.totalAmount), 0);

    const informalStockEntries = await db.stockHistory.findMany({
      where: {
        createdAt: { gte: startOfDay, lt: endOfDay },
        changeType: 'purchase',
        purchaseId: null,
      },
      include: { product: true }
    });

    const informalPurchasesAmount = informalStockEntries.reduce((sum, entry) => {
      let unitPrice = Number(entry.product.buyingPrice);
      if (entry.reason) {
        const match = entry.reason.match(/@\s*[^0-9]*([0-9.]+)/);
        if (match && match[1]) {
          unitPrice = parseFloat(match[1]);
        }
      }
      return sum + (Number(entry.quantity) * unitPrice);
    }, 0);

    const totalPurchasesAmount = totalPurchasesAmountFromSupplier + informalPurchasesAmount;
    const totalPurchasesCount = todayPurchases.length + informalStockEntries.length;

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

    // ---- COST OF GOODS SOLD (sale-time cost snapshot) ----
    const todaySaleItems = await db.saleItem.findMany({
      where: {
        sale: {
          createdAt: { gte: startOfDay, lt: endOfDay },
          status: { in: ['Completed', 'PartialReturn'] },
        },
        quantity: { gt: 0 },
      },
      select: {
        productId: true,
        quantity: true,
        totalPrice: true,
        productName: true,
        costPriceAtSale: true,
      },
    });

    // Subtract returned quantities for today
    const returnItemsToday = await db.saleReturnItem.findMany({
      where: {
        saleReturn: {
          OR: [
            { createdAt: { gte: startOfDay, lt: endOfDay } },
            { saleId: { in: todaySaleIds } },
          ],
        },
      },
      select: { productId: true, quantity: true },
    });
    const returnedQtyByProduct = returnItemsToday.reduce<Record<string, number>>((acc, r) => {
      acc[r.productId] = (acc[r.productId] || 0) + Number(r.quantity);
      return acc;
    }, {});

    const productIds = [...new Set(todaySaleItems.map((item) => item.productId))];
    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, buyingPrice: true, nameBn: true },
    });
    const productBuyingPriceMap = new Map(products.map((p) => [p.id, Number(p.buyingPrice)]));
    const productNameBnMap = new Map(products.map((p) => [p.id, p.nameBn]));

    // Weighted average unit cost per product from snapshots (for return net-out)
    const costAggByProduct = todaySaleItems.reduce<
      Record<string, { qty: number; cost: number }>
    >((acc, item) => {
      const qty = Number(item.quantity);
      const snap = Number(item.costPriceAtSale);
      const unit = snap > 0 ? snap : (productBuyingPriceMap.get(item.productId) ?? 0);
      const prev = acc[item.productId] || { qty: 0, cost: 0 };
      prev.qty += qty;
      prev.cost += unit * qty;
      acc[item.productId] = prev;
      return acc;
    }, {});

    const costOfGoodsSold = Object.entries(costAggByProduct).reduce((sum, [productId, agg]) => {
      const returned = returnedQtyByProduct[productId] || 0;
      const netQty = Math.max(0, agg.qty - returned);
      const avgUnit = agg.qty > 0 ? agg.cost / agg.qty : 0;
      return sum + avgUnit * netQty;
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

    // Dues collected: debit entries that reduce customer due (exclude refund-related reverse-due noise if desired;
    // include manual collection, sale payments, due clearance). Prepayments use entryType prepayment-*.
    const todayDebitLedger = await db.ledgerEntry.findMany({
      where: {
        entryType: 'debit',
        createdAt: { gte: startOfDay, lt: endOfDay },
        NOT: {
          OR: [
            { description: { contains: 'prepaid', mode: 'insensitive' } },
            { description: { contains: 'Prepayment', mode: 'insensitive' } },
            { description: { contains: 'return refund', mode: 'insensitive' } },
          ],
        },
      },
      select: { amount: true, description: true },
    });
    // Prefer explicit due-payment descriptions; fall back to all remaining debits
    const duePaymentEntries = todayDebitLedger.filter((e) => {
      const d = (e.description || '').toLowerCase();
      return (
        d.includes('due collection') ||
        d.includes('due clearance') ||
        d.includes('payment for sale') ||
        d.includes('manual due') ||
        d.includes('offline sync payment') ||
        d.includes('offline sync due clearance') ||
        d.includes('বকেয়া') ||
        d.includes('reverse due') // refund reducing due is not "collected cash" but reduces outstanding
      );
    });
    // Cash collected against dues: exclude "reverse due" (those are refund adjustments, not cash in)
    const cashDueCollections = (duePaymentEntries.length > 0 ? duePaymentEntries : todayDebitLedger).filter(
      (e) => !(e.description || '').toLowerCase().includes('reverse due'),
    );
    const duesCollected = cashDueCollections.reduce((sum, entry) => sum + Number(entry.amount), 0);

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
        const nameBn = productNameBnMap.get(item.productId);
        if (nameBn) {
          productSalesMap[item.productId].nameBn = nameBn;
        }
      }
      productSalesMap[item.productId].quantity += Number(item.quantity);
      productSalesMap[item.productId].revenue += Number(Number(item.totalPrice));
    }
    // Net out returns for top products
    for (const [productId, retQty] of Object.entries(returnedQtyByProduct)) {
      if (productSalesMap[productId]) {
        const unitRev =
          productSalesMap[productId].quantity > 0
            ? productSalesMap[productId].revenue / productSalesMap[productId].quantity
            : 0;
        productSalesMap[productId].quantity = Math.max(
          0,
          productSalesMap[productId].quantity - retQty,
        );
        productSalesMap[productId].revenue = Math.max(
          0,
          productSalesMap[productId].revenue - unitRev * retQty,
        );
      }
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
    // The opening balance is computed as all accumulated cash inflows minus outflows
    // up to (but not including) today's local midnight.

    // 1. All past sales cash & UPI (direct cash that came in)
    const pastSales = await db.sale.aggregate({
      where: {
        createdAt: { lt: startOfDay },
        status: { in: ['Completed', 'PartialReturn'] },
      },
      _sum: {
        cashAmount: true,
        upiAmount: true,
      }
    });

    // 2. All past expenses (cash that went out — ALL categories including supplier payments)
    const pastExpenses = await db.expense.aggregate({
      where: {
        date: { lt: startOfDay },
        isActive: true,
      },
      _sum: {
        amount: true,
      }
    });

    // 3. All past due collections (cash that came in via debit ledger entries)
    const pastDueCollections = await db.ledgerEntry.aggregate({
      where: {
        entryType: 'debit',
        createdAt: { lt: startOfDay },
        NOT: {
          OR: [
            { description: { contains: 'prepaid', mode: 'insensitive' } },
            { description: { contains: 'Prepayment', mode: 'insensitive' } },
            { description: { contains: 'return refund', mode: 'insensitive' } },
            { description: { contains: 'reverse due', mode: 'insensitive' } },
          ],
        },
      },
      _sum: {
        amount: true,
      }
    });

    // 4. All past cash refunds (cash that went out)
    const pastRefunds = await db.saleReturn.aggregate({
      where: {
        createdAt: { lt: startOfDay },
        refundMethod: 'Cash'
      },
      _sum: {
        refundAmount: true,
      }
    });

    // 5. Past prepaid top-up cash inflows (customer pays cash → store credit)
    //    These are credit ledger entries with prepaid/topup descriptions.
    const pastPrepaidTopups = await db.ledgerEntry.aggregate({
      where: {
        entryType: 'credit',
        createdAt: { lt: startOfDay },
        OR: [
          { description: { contains: 'prepaid topup', mode: 'insensitive' } },
          { description: { contains: 'prepayment topup', mode: 'insensitive' } },
          { description: { contains: 'wallet topup', mode: 'insensitive' } },
          { description: { contains: 'add balance', mode: 'insensitive' } },
        ],
      },
      _sum: { amount: true },
    });

    const openingBalance =
      Number(pastSales._sum.cashAmount || 0) +
      Number(pastSales._sum.upiAmount || 0) +
      Number(pastDueCollections._sum.amount || 0) +
      Number(pastPrepaidTopups._sum.amount || 0) -
      Number(pastExpenses._sum.amount || 0) -
      Number(pastRefunds._sum.refundAmount || 0);

    // Today's cash and UPI (adjusted for dues collected and refunds today)
    const todayCashRefunds = returnsToday
      .filter(r => r.refundMethod === 'Cash' || !r.refundMethod)
      .reduce((sum, r) => sum + Number(r.refundAmount), 0);

    const todayCashTotal = todaySales.reduce((sum, s) => sum + Number(s.cashAmount || 0), 0) + duesCollected - todayCashRefunds;
    const todayUpiTotal = todaySales.reduce((sum, s) => sum + Number(s.upiAmount || 0), 0);

    // Supplier payment expenses today (cash going out for stock — separate visibility)
    const todaySupplierPayments = todayExpenses
      .filter((e) => e.category === 'Supplier Payment')
      .reduce((sum, e) => sum + Number(e.amount), 0);

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
        totalPurchasesCount,
        supplierPurchasesAmount: totalPurchasesAmountFromSupplier,
        informalPurchasesAmount,
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
        todaySupplierPayments,
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
