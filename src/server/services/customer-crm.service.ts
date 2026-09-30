/**
 * Customer CRM Service — Rich customer intelligence
 *
 * Provides comprehensive customer analytics for CRM features:
 * - Total purchases and visit frequency
 * - Average bill size
 * - Favorite products
 * - Customer lifetime value
 * - Due collection history
 */

import { db } from '@/lib/db';
import Decimal from 'decimal.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  totalDue: number;
  totalPaid: number;
  prepaidBalance: number;
  createdAt: Date;

  // CRM Metrics (calculated)
  totalPurchases: number;
  totalOrders: number;
  averageBillSize: number;
  lastPurchaseDate: Date | null;
  daysSinceLastPurchase: number | null;
  favoriteCategory: string | null;
  favoriteProducts: Array<{ name: string; count: number; totalAmount: number }>;
  monthlyTrend: Array<{ month: string; amount: number; count: number }>;
}

export interface CustomerSegment {
  segment: 'vip' | 'regular' | 'occasional' | 'inactive' | 'new';
  label: string;
  labelBn: string;
  color: string;
}

// ============================================================================
// CUSTOMER PROFILE
// ============================================================================

export async function getCustomerProfile(
  customerId: string,
  businessId: string
): Promise<CustomerProfile | null> {
  const customer = await db.customer.findFirst({
    where: { id: customerId, businessId },
  });

  if (!customer) return null;

  // Get all sales for this customer
  const sales = await db.sale.findMany({
    where: {
      customerId,
      businessId,
      status: 'COMPLETED',
    },
    include: {
      items: {
        include: {
          product: { select: { name: true, category: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Calculate metrics
  const totalPurchases = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
  const totalOrders = sales.length;
  const averageBillSize = totalOrders > 0 ? totalPurchases / totalOrders : 0;

  const lastPurchaseDate = sales[0]?.createdAt ?? null;
  const daysSinceLastPurchase = lastPurchaseDate
    ? Math.floor((Date.now() - new Date(lastPurchaseDate).getTime()) / 86400000)
    : null;

  // Favorite products
  const productCounts = new Map<string, { name: string; count: number; totalAmount: number }>();
  const categoryCounts = new Map<string, number>();

  for (const sale of sales) {
    for (const item of sale.items) {
      const key = item.productId;
      const existing = productCounts.get(key);
      if (existing) {
        existing.count += Number(item.quantity);
        existing.totalAmount += Number(item.totalPrice);
      } else {
        productCounts.set(key, {
          name: item.productName,
          count: Number(item.quantity),
          totalAmount: Number(item.totalPrice),
        });
      }

      // Category counts
      const cat = item.product?.category ?? 'Unknown';
      categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
    }
  }

  const favoriteProducts = Array.from(productCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const favoriteCategory = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Monthly trend (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const recentSales = sales.filter((s) => new Date(s.createdAt) >= sixMonthsAgo);
  const monthlyMap = new Map<string, { amount: number; count: number }>();

  for (const sale of recentSales) {
    const month = new Date(sale.createdAt).toISOString().slice(0, 7); // "2024-01"
    const existing = monthlyMap.get(month);
    if (existing) {
      existing.amount += Number(sale.totalAmount);
      existing.count += 1;
    } else {
      monthlyMap.set(month, { amount: Number(sale.totalAmount), count: 1 });
    }
  }

  const monthlyTrend = Array.from(monthlyMap.entries())
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    totalDue: Number(customer.totalDue),
    totalPaid: Number(customer.totalPaid),
    prepaidBalance: Number(customer.prepaidBalance),
    createdAt: customer.createdAt,
    totalPurchases,
    totalOrders,
    averageBillSize,
    lastPurchaseDate,
    daysSinceLastPurchase,
    favoriteCategory,
    favoriteProducts,
    monthlyTrend,
  };
}

// ============================================================================
// CUSTOMER SEGMENTATION
// ============================================================================

export function getCustomerSegment(profile: {
  totalOrders: number;
  totalPurchases: number;
  daysSinceLastPurchase: number | null;
  createdAt: Date;
}): CustomerSegment {
  const daysSince = profile.daysSinceLastPurchase ?? 999;
  const daysSinceCreated = Math.floor(
    (Date.now() - new Date(profile.createdAt).getTime()) / 86400000
  );

  if (daysSinceCreated < 30 && profile.totalOrders <= 2) {
    return { segment: 'new', label: 'New', labelBn: 'নতুন', color: '#3B82F6' };
  }

  if (profile.totalPurchases >= 50000 || profile.totalOrders >= 20) {
    return { segment: 'vip', label: 'VIP', labelBn: 'VIP', color: '#F59E0B' };
  }

  if (daysSince > 90) {
    return { segment: 'inactive', label: 'Inactive', labelBn: 'নিষ্ক্রিয়', color: '#6B7280' };
  }

  if (profile.totalOrders >= 5) {
    return { segment: 'regular', label: 'Regular', labelBn: 'নিয়মিত', color: '#10B981' };
  }

  return { segment: 'occasional', label: 'Occasional', labelBn: 'মাঝেমাঝে', color: '#8B5CF6' };
}

// ============================================================================
// TOP CUSTOMERS
// ============================================================================

export async function getTopCustomers(
  businessId: string,
  limit = 10,
  period?: { from: Date; to: Date }
): Promise<Array<{
  id: string;
  name: string;
  phone: string | null;
  totalAmount: number;
  orderCount: number;
  totalDue: number;
}>> {
  const whereClause = period
    ? { gte: period.from, lte: period.to }
    : undefined;

  const results = await db.sale.groupBy({
    by: ['customerId'],
    where: {
      businessId,
      status: 'COMPLETED',
      customerId: { not: null },
      ...(whereClause ? { createdAt: whereClause } : {}),
    },
    _sum: { totalAmount: true },
    _count: { id: true },
    orderBy: { _sum: { totalAmount: 'desc' } },
    take: limit,
  });

  if (results.length === 0) return [];

  const customerIds = results.map((r) => r.customerId!);
  const customers = await db.customer.findMany({
    where: { id: { in: customerIds } },
    select: { id: true, name: true, phone: true, totalDue: true },
  });

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  return results.map((r) => {
    const customer = customerMap.get(r.customerId!);
    return {
      id: r.customerId!,
      name: customer?.name ?? 'Unknown',
      phone: customer?.phone ?? null,
      totalAmount: Number(r._sum.totalAmount ?? 0),
      orderCount: r._count.id,
      totalDue: Number(customer?.totalDue ?? 0),
    };
  });
}
