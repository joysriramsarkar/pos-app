export const dynamic = 'force-dynamic';
// ============================================================================
// Stats API Route - Lakhan Bhandar POS
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/api-middleware';

// GET /api/stats - Fetch dashboard stats
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
    const today = new Date(localNow.getTime() + tzOffset * 60 * 1000);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // 1. Get Today's and Yesterday's Sales in parallel
    const [salesToday, salesYesterday, totalDue] = await Promise.all([
      db.sale.aggregate({
        where: {
          createdAt: { gte: today, lt: tomorrow },
          status: 'Completed',
        },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      db.sale.aggregate({
        where: {
          createdAt: { gte: yesterday, lt: today },
          status: 'Completed',
        },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      db.customer.aggregate({
        _sum: { totalDue: true },
      }),
    ]);

    const todaySales = Number(salesToday._sum.totalAmount || 0);
    const todayOrders = salesToday._count.id || 0;
    const yesterdaySales = Number(salesYesterday._sum.totalAmount || 0);
    const yesterdayOrders = salesYesterday._count.id || 0;

    let salesComparison = 'N/A';
    if (yesterdaySales > 0) {
      const diff = ((todaySales - yesterdaySales) / yesterdaySales) * 100;
      salesComparison = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}% from yesterday`;
    }

    let ordersComparison = 'N/A';
    if (yesterdayOrders > 0) {
      const diff = todayOrders - yesterdayOrders;
      ordersComparison = `${diff >= 0 ? '+' : ''}${diff} from yesterday`;
    }

    const stats = {
      todaySales,
      todayOrders,
      duePayments: totalDue._sum.totalDue || 0,
      salesComparison,
      ordersComparison,
    };

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error: unknown) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
