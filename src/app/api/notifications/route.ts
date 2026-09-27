export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireBusinessContext } from '@/lib/tenant';

export interface NotificationItem {
  id: string;
  type: 'low_stock' | 'out_of_stock' | 'due_payment';
  title: string;
  message: string;
  productName?: string;
  productNameBn?: string | null;
  currentStock?: number;
  unit?: string;
  customerName?: string;
  dueAmount?: number;
  icon: 'alert' | 'critical' | 'wallet';
  severity?: 'critical' | 'warning' | 'info';
  createdAt: string;
  read: boolean;
  referenceId?: string;
}

const MAX_OUT_OF_STOCK = 10;
const MAX_LOW_STOCK = 10;
const MAX_DUE = 10;
const MAX_TOTAL = 30;

export async function GET(request: NextRequest) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
  };

  try {
    const ctx = await requireBusinessContext();
    if (ctx instanceof NextResponse) return ctx;

    const businessId = ctx.business.id;
    const notifications: NotificationItem[] = [];

    // Parallel lightweight queries without heavy relation joins
    const [outOfStockProducts, lowStockProducts, customersWithDue] = await Promise.all([
      // 1. Out of stock — capped
      db.product.findMany({
        where: { businessId, currentStock: 0, isActive: true },
        orderBy: { updatedAt: 'desc' },
        take: MAX_OUT_OF_STOCK,
        select: {
          id: true,
          name: true,
          nameBn: true,
          unit: true,
          updatedAt: true,
        },
      }).catch(() => []),

      // 2. Low stock via SQL — exclude already out of stock
      db.$queryRaw<
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
        WHERE business_id = ${businessId}
          AND is_active = true
          AND current_stock > 0
          AND current_stock <= min_stock_level
        ORDER BY current_stock ASC, updated_at DESC
        LIMIT ${MAX_LOW_STOCK}
      `.catch(() => []),

      // 3. Due reminders — top balances directly from customer table (no nested sales join)
      db.customer.findMany({
        where: {
          businessId,
          totalDue: { gt: 0 },
          isActive: true,
        },
        orderBy: { totalDue: 'desc' },
        take: MAX_DUE,
        select: {
          id: true,
          name: true,
          totalDue: true,
          updatedAt: true,
        },
      }).catch(() => []),
    ]);

    for (const product of outOfStockProducts) {
      const name = product.nameBn || product.name;
      notifications.push({
        id: `out-of-stock-${product.id}`,
        type: 'out_of_stock',
        title: 'Out of stock alert',
        message: `${name} is out of stock`,
        productName: product.name,
        productNameBn: product.nameBn,
        icon: 'critical',
        severity: 'critical',
        createdAt: product.updatedAt.toISOString(),
        read: false,
        referenceId: product.id,
      });
    }

    for (const product of lowStockProducts) {
      const name = product.nameBn || product.name;
      notifications.push({
        id: `low-stock-${product.id}`,
        type: 'low_stock',
        title: 'Low stock alert',
        message: `${name} low stock`,
        productName: product.name,
        productNameBn: product.nameBn,
        currentStock: product.currentStock,
        unit: product.unit,
        icon: 'alert',
        severity: 'warning',
        createdAt: new Date(product.updatedAt).toISOString(),
        read: false,
        referenceId: product.id,
      });
    }

    for (const customer of customersWithDue) {
      const due = Number(customer.totalDue);
      notifications.push({
        id: `due-payment-${customer.id}`,
        type: 'due_payment',
        title: 'Due payment alert',
        message: `${customer.name} due ${due}`,
        customerName: customer.name,
        dueAmount: due,
        icon: 'wallet',
        severity: 'info',
        createdAt: customer.updatedAt.toISOString(),
        read: false,
        referenceId: customer.id,
      });
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

    return NextResponse.json(
      {
        success: true,
        data: capped,
        unreadCount,
        meta: {
          maxTotal: MAX_TOTAL,
          counts: {
            outOfStock: outOfStockProducts.length,
            lowStock: lowStockProducts.length,
            due: customersWithDue.length,
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
