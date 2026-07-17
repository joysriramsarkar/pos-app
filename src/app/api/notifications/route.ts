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
  severity: 'critical' | 'warning' | 'info';
  createdAt: string;
  read: boolean;
  referenceId?: string;
}

const MAX_OUT_OF_STOCK = 15;
const MAX_LOW_STOCK = 15;
const MAX_DUE = 15;
const MAX_TOTAL = 40;

function toBnNum(num: number): string {
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return num.toString().replace(/\d/g, (d) => bnDigits[parseInt(d)]);
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response!;

  const headers = { 'Content-Type': 'application/json; charset=utf-8' };

  try {
    const notifications: NotificationItem[] = [];

    // 1. Out of stock — capped, newest first
    const outOfStockProducts = await db.product.findMany({
      where: { currentStock: 0, isActive: true },
      orderBy: { updatedAt: 'desc' },
      take: MAX_OUT_OF_STOCK,
      select: {
        id: true,
        name: true,
        nameBn: true,
        unit: true,
        updatedAt: true,
      },
    });

    for (const product of outOfStockProducts) {
      const name = product.nameBn || product.name;
      notifications.push({
        id: `out-of-stock-${product.id}`,
        type: 'out_of_stock',
        title: 'স্টক শেষ সতর্কতা',
        message: `${name} এর স্টক শেষ!`,
        icon: 'critical',
        severity: 'critical',
        createdAt: product.updatedAt.toISOString(),
        read: false,
        referenceId: product.id,
      });
    }

    // 2. Low stock via SQL (avoid loading entire catalog) — exclude already out of stock
    const lowStockProducts = await db.$queryRaw<
      Array<{
        id: string;
        name: string;
        nameBn: string | null;
        unit: string;
        currentStock: number;
        minStockLevel: number;
        updatedAt: Date;
      }>
    >`
      SELECT id, name, name_bn as "nameBn", unit,
             CAST(current_stock AS FLOAT) as "currentStock",
             CAST(min_stock_level AS FLOAT) as "minStockLevel",
             updated_at as "updatedAt"
      FROM products
      WHERE is_active = true
        AND current_stock > 0
        AND current_stock <= min_stock_level
      ORDER BY current_stock ASC, updated_at DESC
      LIMIT ${MAX_LOW_STOCK}
    `;

    for (const product of lowStockProducts) {
      const name = product.nameBn || product.name;
      notifications.push({
        id: `low-stock-${product.id}`,
        type: 'low_stock',
        title: 'কম স্টক সতর্কতা',
        message: `${name} এর স্টক কম (${toBnNum(Number(product.currentStock))} ${product.unit} বাকি)`,
        icon: 'alert',
        severity: 'warning',
        createdAt: new Date(product.updatedAt).toISOString(),
        read: false,
        referenceId: product.id,
      });
    }

    // 3. Due reminders — top balances with old open sales (cap)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const customersWithDue = await db.customer.findMany({
      where: {
        totalDue: { gt: 0 },
        isActive: true,
      },
      orderBy: { totalDue: 'desc' },
      take: MAX_DUE * 2,
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

    let dueCount = 0;
    for (const customer of customersWithDue) {
      if (dueCount >= MAX_DUE) break;
      if (customer.sales.length === 0) continue;
      const due = Number(customer.totalDue);
      notifications.push({
        id: `due-payment-${customer.id}`,
        type: 'due_payment',
        title: 'বাকি পেমেন্ট সতর্কতা',
        message: `${customer.name} এর ${toBnNum(Math.round(due))} টাকা বাকি আছে`,
        icon: 'wallet',
        severity: 'info',
        createdAt: customer.sales[0].createdAt.toISOString(),
        read: false,
        referenceId: customer.id,
      });
      dueCount += 1;
    }

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

    const capped = notifications.slice(0, MAX_TOTAL);
    const unreadCount = capped.filter((n) => !n.read).length;
    const truncated =
      outOfStockProducts.length >= MAX_OUT_OF_STOCK ||
      lowStockProducts.length >= MAX_LOW_STOCK ||
      dueCount >= MAX_DUE;

    return NextResponse.json(
      {
        success: true,
        data: capped,
        unreadCount,
        meta: {
          capped: truncated,
          maxTotal: MAX_TOTAL,
          counts: {
            outOfStock: outOfStockProducts.length,
            lowStock: lowStockProducts.length,
            due: dueCount,
          },
        },
      },
      { headers },
    );
  } catch (error) {
    console.error('বিজ্ঞপ্তি আনতে ত্রুটি:', error);
    return NextResponse.json(
      { success: false, data: [], unreadCount: 0, error: 'বিজ্ঞপ্তি আনতে ত্রুটি হয়েছে' },
      { status: 500, headers },
    );
  }
}
