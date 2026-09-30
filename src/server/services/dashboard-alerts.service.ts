/**
 * Dashboard Alerts Service — "Actionable intelligence" for shop owners
 *
 * Returns actionable alerts that require attention:
 * - Low stock warnings
 * - Overdue customer dues
 * - Overdue supplier payments
 * - Sales trends (up/down)
 * - Sync issues
 */

import { db } from '@/lib/db';
import Decimal from 'decimal.js';

// ============================================================================
// TYPES
// ============================================================================

export type AlertSeverity = 'critical' | 'warning' | 'info' | 'success';

export type AlertType =
  | 'LOW_STOCK'
  | 'OVERDUE_CUSTOMER'
  | 'OVERDUE_SUPPLIER'
  | 'SALES_TREND_UP'
  | 'SALES_TREND_DOWN'
  | 'SYNC_PENDING'
  | 'SHIFT_OPEN';

export interface DashboardAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  titleBn: string;
  message: string;
  messageBn: string;
  count?: number;
  amount?: number;
  actionLabel?: string;
  actionLabelBn?: string;
  actionUrl?: string;
}

// ============================================================================
// ALERTS SERVICE
// ============================================================================

export async function getDashboardAlerts(businessId: string): Promise<DashboardAlert[]> {
  const alerts: DashboardAlert[] = [];

  // Run all alert checks in parallel for performance
  const [
    lowStockResult,
    overdueCustomerResult,
    overdueSupplierResult,
    salesTrendResult,
    shiftResult,
  ] = await Promise.allSettled([
    getLowStockAlert(businessId),
    getOverdueCustomerAlert(businessId),
    getOverdueSupplierAlert(businessId),
    getSalesTrendAlert(businessId),
    getOpenShiftAlert(businessId),
  ]);

  for (const result of [
    lowStockResult,
    overdueCustomerResult,
    overdueSupplierResult,
    salesTrendResult,
    shiftResult,
  ]) {
    if (result.status === 'fulfilled' && result.value) {
      if (Array.isArray(result.value)) {
        alerts.push(...result.value);
      } else {
        alerts.push(result.value);
      }
    }
  }

  // Sort by severity
  const severityOrder: Record<AlertSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
    success: 3,
  };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return alerts;
}

// ============================================================================
// INDIVIDUAL ALERT CHECKS
// ============================================================================

async function getLowStockAlert(businessId: string): Promise<DashboardAlert | null> {
  const count = await db.product.count({
    where: {
      businessId,
      isActive: true,
      // currentStock <= minStockLevel using raw comparison
    },
  });

  // Use raw query for comparison of two decimal columns
  const result = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM products
    WHERE business_id = ${businessId}
      AND is_active = true
      AND current_stock <= min_stock_level
  `;

  const lowCount = Number(result[0]?.count ?? 0);
  if (lowCount === 0) return null;

  return {
    id: 'low-stock',
    type: 'LOW_STOCK',
    severity: lowCount > 20 ? 'critical' : 'warning',
    title: `${lowCount} products below minimum stock`,
    titleBn: `${lowCount}টি পণ্যে স্টক কম`,
    message: `${lowCount} products are at or below their minimum stock level`,
    messageBn: `${lowCount}টি পণ্যের স্টক সর্বনিম্ন মাত্রায় বা নিচে`,
    count: lowCount,
    actionLabel: 'View Stock',
    actionLabelBn: 'স্টক দেখুন',
    actionUrl: '/pos?page=stock',
  };
}

async function getOverdueCustomerAlert(businessId: string): Promise<DashboardAlert | null> {
  const result = await db.customer.aggregate({
    where: { businessId, isActive: true, totalDue: { gt: 0 } },
    _sum: { totalDue: true },
    _count: { id: true },
  });

  const totalDue = Number(result._sum.totalDue ?? 0);
  const customerCount = result._count.id;

  if (totalDue === 0) return null;

  return {
    id: 'overdue-customers',
    type: 'OVERDUE_CUSTOMER',
    severity: totalDue > 10000 ? 'critical' : 'warning',
    title: `₹${totalDue.toLocaleString('en-IN')} customer dues pending`,
    titleBn: `গ্রাহকদের ₹${totalDue.toLocaleString('bn-IN')} বাকি`,
    message: `${customerCount} customers owe a total of ₹${totalDue.toLocaleString('en-IN')}`,
    messageBn: `${customerCount} জন গ্রাহকের কাছে মোট ₹${totalDue.toLocaleString('bn-IN')} পাওনা`,
    count: customerCount,
    amount: totalDue,
    actionLabel: 'Collect Dues',
    actionLabelBn: 'বাকি আদায়',
    actionUrl: '/pos?page=due-collection',
  };
}

async function getOverdueSupplierAlert(businessId: string): Promise<DashboardAlert | null> {
  const result = await db.supplier.aggregate({
    where: { businessId, isActive: true, totalDue: { gt: 0 } },
    _sum: { totalDue: true },
    _count: { id: true },
  });

  const totalDue = Number(result._sum.totalDue ?? 0);
  const supplierCount = result._count.id;

  if (totalDue === 0) return null;

  return {
    id: 'supplier-payable',
    type: 'OVERDUE_SUPPLIER',
    severity: 'warning',
    title: `₹${totalDue.toLocaleString('en-IN')} supplier payment due`,
    titleBn: `সরবরাহকারীকে ₹${totalDue.toLocaleString('bn-IN')} দিতে হবে`,
    message: `${supplierCount} suppliers are owed ₹${totalDue.toLocaleString('en-IN')}`,
    messageBn: `${supplierCount} জন সরবরাহকারীকে মোট ₹${totalDue.toLocaleString('bn-IN')} দেওয়া বাকি`,
    count: supplierCount,
    amount: totalDue,
    actionLabel: 'View Suppliers',
    actionLabelBn: 'সরবরাহকারী দেখুন',
    actionUrl: '/pos?page=parties',
  };
}

async function getSalesTrendAlert(
  businessId: string
): Promise<DashboardAlert[]> {
  const alerts: DashboardAlert[] = [];

  // Compare this week vs last week
  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - 7);

  const lastWeekStart = new Date(now);
  lastWeekStart.setDate(now.getDate() - 14);

  const [thisWeek, lastWeek] = await Promise.all([
    db.sale.aggregate({
      where: {
        businessId,
        status: 'COMPLETED',
        createdAt: { gte: thisWeekStart },
      },
      _sum: { totalAmount: true },
    }),
    db.sale.aggregate({
      where: {
        businessId,
        status: 'COMPLETED',
        createdAt: { gte: lastWeekStart, lt: thisWeekStart },
      },
      _sum: { totalAmount: true },
    }),
  ]);

  const thisWeekTotal = Number(thisWeek._sum.totalAmount ?? 0);
  const lastWeekTotal = Number(lastWeek._sum.totalAmount ?? 0);

  if (lastWeekTotal > 0) {
    const changePercent = Math.round(
      ((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100
    );

    if (changePercent >= 15) {
      alerts.push({
        id: 'sales-up',
        type: 'SALES_TREND_UP',
        severity: 'success',
        title: `Sales up ${changePercent}% this week`,
        titleBn: `এই সপ্তাহে বিক্রি ${changePercent}% বেশি`,
        message: `This week: ₹${thisWeekTotal.toLocaleString('en-IN')} vs last week: ₹${lastWeekTotal.toLocaleString('en-IN')}`,
        messageBn: `এই সপ্তাহ: ₹${thisWeekTotal.toLocaleString('bn-IN')}, গত সপ্তাহ: ₹${lastWeekTotal.toLocaleString('bn-IN')}`,
      });
    } else if (changePercent <= -15) {
      alerts.push({
        id: 'sales-down',
        type: 'SALES_TREND_DOWN',
        severity: 'info',
        title: `Sales down ${Math.abs(changePercent)}% this week`,
        titleBn: `এই সপ্তাহে বিক্রি ${Math.abs(changePercent)}% কম`,
        message: `This week: ₹${thisWeekTotal.toLocaleString('en-IN')} vs last week: ₹${lastWeekTotal.toLocaleString('en-IN')}`,
        messageBn: `এই সপ্তাহ: ₹${thisWeekTotal.toLocaleString('bn-IN')}, গত সপ্তাহ: ₹${lastWeekTotal.toLocaleString('bn-IN')}`,
      });
    }
  }

  return alerts;
}

async function getOpenShiftAlert(businessId: string): Promise<DashboardAlert | null> {
  const openShift = await db.cashRegisterShift.findFirst({
    where: { businessId, isActive: true },
    orderBy: { openedAt: 'desc' },
  });

  if (!openShift) return null;

  const hours = Math.floor(
    (Date.now() - new Date(openShift.openedAt).getTime()) / 3600000
  );

  if (hours < 12) return null; // Only alert after 12 hours

  return {
    id: 'long-shift',
    type: 'SHIFT_OPEN',
    severity: 'warning',
    title: `Shift open for ${hours} hours`,
    titleBn: `${hours} ঘণ্টা ধরে shift খোলা`,
    message: `Cash register shift has been open since ${new Date(openShift.openedAt).toLocaleTimeString()}`,
    messageBn: `Cash register shift ${new Date(openShift.openedAt).toLocaleTimeString('bn-BD')} থেকে খোলা আছে`,
    actionLabel: 'Close Shift',
    actionLabelBn: 'Shift বন্ধ করুন',
    actionUrl: '/pos?page=dashboard',
  };
}

// ============================================================================
// TODAY SUMMARY
// ============================================================================

export interface TodaySummary {
  sales: number;
  profit: number;
  cashSales: number;
  upiSales: number;
  totalDue: number;
  expenses: number;
  saleCount: number;
  lowStockCount: number;
}

export async function getTodaySummary(businessId: string): Promise<TodaySummary> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [salesResult, expenseResult, newDueResult, lowStockResult] = await Promise.all([
    db.sale.findMany({
      where: {
        businessId,
        status: 'COMPLETED',
        createdAt: { gte: todayStart, lte: todayEnd },
      },
      include: {
        items: { select: { quantity: true, costPriceAtSale: true, totalPrice: true } },
        payments: { select: { method: true, amount: true } },
      },
    }),
    db.expense.aggregate({
      where: {
        businessId,
        isActive: true,
        date: { gte: todayStart, lte: todayEnd },
      },
      _sum: { amount: true },
    }),
    db.sale.aggregate({
      where: {
        businessId,
        paymentStatus: 'DUE',
        createdAt: { gte: todayStart, lte: todayEnd },
      },
      _sum: { totalAmount: true },
    }),
    db.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM products
      WHERE business_id = ${businessId}
        AND is_active = true
        AND current_stock <= min_stock_level
    `,
  ]);

  let totalSales = 0;
  let totalCash = 0;
  let totalUPI = 0;
  let totalCOGS = 0;

  for (const sale of salesResult) {
    totalSales += Number(sale.totalAmount);
    for (const payment of sale.payments) {
      if (payment.method === 'CASH') totalCash += Number(payment.amount);
      else if (payment.method === 'UPI') totalUPI += Number(payment.amount);
    }
    // COGS from sale items
    for (const item of sale.items) {
      totalCOGS += Number(item.costPriceAtSale) * Number(item.quantity);
    }
  }

  // For sales without payment records (legacy), use cashAmount/upiAmount fields
  if (salesResult.some((s) => s.payments.length === 0)) {
    totalCash = 0;
    totalUPI = 0;
    for (const sale of salesResult) {
      if (sale.payments.length === 0) {
        totalCash += Number((sale as any).cashAmount ?? 0);
        totalUPI += Number((sale as any).upiAmount ?? 0);
      }
    }
  }

  return {
    sales: totalSales,
    profit: totalSales - totalCOGS,
    cashSales: totalCash,
    upiSales: totalUPI,
    totalDue: Number(newDueResult._sum.totalAmount ?? 0),
    expenses: Number(expenseResult._sum.amount ?? 0),
    saleCount: salesResult.length,
    lowStockCount: Number(lowStockResult[0]?.count ?? 0),
  };
}
