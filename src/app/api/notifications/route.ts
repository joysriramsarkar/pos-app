export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-middleware';

export interface NotificationItem {
  id: string;
  type: 'low_stock' | 'out_of_stock' | 'due_payment';
  title: string;
  message: string;
  icon: 'alert' | 'critical' | 'wallet';
  createdAt: string;
  read: boolean;
  referenceId?: string;
}

function toBnNum(num: number): string {
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return num.toString().replace(/\d/g, (d) => bnDigits[parseInt(d)]);
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response!;

  try {
    const notifications: NotificationItem[] = [];

    // 1. Out of stock products (currentStock = 0)
    const outOfStockProducts = await db.product.findMany({
      where: {
        currentStock: 0,
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    for (const product of outOfStockProducts) {
      const name = product.nameBn || product.name;
      notifications.push({
        id: `out-of-stock-${product.id}`,
        type: 'out_of_stock',
        title: 'স্টক শেষ সতর্কতা',
        message: `${name} এর স্টক শেষ!`,
        icon: 'critical',
        createdAt: product.updatedAt.toISOString(),
        read: false,
        referenceId: product.id,
      });
    }

    // 2. Low stock products (currentStock > 0 && currentStock <= minStockLevel)
    const allActiveProducts = await db.product.findMany({
      where: { isActive: true, currentStock: { gt: 0 } },
    });

    const lowStockFiltered = allActiveProducts.filter(
      (p) => p.currentStock <= p.minStockLevel
    );

    for (const product of lowStockFiltered) {
      const name = product.nameBn || product.name;
      notifications.push({
        id: `low-stock-${product.id}`,
        type: 'low_stock',
        title: 'কম স্টক সতর্কতা',
        message: `${name} এর স্টক কম (${toBnNum(Number(product.currentStock))} ${product.unit} বাকি)`,
        icon: 'alert',
        createdAt: product.updatedAt.toISOString(),
        read: false,
        referenceId: product.id,
      });
    }

    // 3. Due payment reminders - customers with totalDue > 0 for more than 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const customersWithDue = await db.customer.findMany({
      where: {
        totalDue: { gt: 0 },
        isActive: true,
      },
      include: {
        sales: {
          where: {
            createdAt: { lte: sevenDaysAgo },
            paymentStatus: { in: ['Due', 'Partial'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    for (const customer of customersWithDue) {
      // Only add notification if customer has a sale older than 7 days with due
      if (customer.sales.length > 0) {
        const due = Number(customer.totalDue);
        notifications.push({
          id: `due-payment-${customer.id}`,
          type: 'due_payment',
          title: 'বাকি পেমেন্ট সতর্কতা',
          message: `${customer.name} এর ${toBnNum(Math.round(due))} টাকা বাকি আছে`,
          icon: 'wallet',
          createdAt: customer.sales[0].createdAt.toISOString(),
          read: false,
          referenceId: customer.id,
        });
      }
    }

    // Sort notifications: out_of_stock first, then low_stock, then due_payment
    const typeOrder: Record<string, number> = {
      out_of_stock: 0,
      low_stock: 1,
      due_payment: 2,
    };

    notifications.sort((a, b) => {
      const typeDiff = typeOrder[a.type] - typeOrder[b.type];
      if (typeDiff !== 0) return typeDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const unreadCount = notifications.filter((n) => !n.read).length;

    return NextResponse.json({
      success: true,
      data: notifications,
      unreadCount,
    });
  } catch (error) {
    console.error('বিজ্ঞপ্তি আনতে ত্রুটি:', error);
    return NextResponse.json(
      { success: false, data: [], unreadCount: 0, error: 'বিজ্ঞপ্তি আনতে ত্রুটি হয়েছে' },
      { status: 500 }
    );
  }
}
