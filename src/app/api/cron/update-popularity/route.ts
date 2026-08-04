import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  // Vercel Cron Authorization
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Raw SQL for performance - aggregate sales per product
    const monthlyStats = await db.$queryRaw`
      SELECT 
        si."product_id" as "productId",
        SUM(si.quantity)::int as monthly_count,
        SUM(si."total_price")::decimal(10,2) as revenue
      FROM "sale_items" si
      JOIN "sales" s ON s.id = si."sale_id"
      WHERE s."created_at" >= ${thirtyDaysAgo}
        AND s.status IN ('Completed', 'PartialReturn')
        AND si.quantity > 0
      GROUP BY si."product_id"
    ` as Array<{ productId: string; monthly_count: number; revenue: Prisma.Decimal }>;

    const weeklyStats = await db.$queryRaw`
      SELECT 
        si."product_id" as "productId",
        SUM(si.quantity)::int as weekly_count
      FROM "sale_items" si
      JOIN "sales" s ON s.id = si."sale_id"
      WHERE s."created_at" >= ${sevenDaysAgo}
        AND s.status IN ('Completed', 'PartialReturn')
        AND si.quantity > 0
      GROUP BY si."product_id"
    ` as Array<{ productId: string; weekly_count: number }>;

    // Upsert into popularity table
    // Use the first day of the current month as the period start
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    for (const stat of monthlyStats) {
      const weekly = weeklyStats.find(w => w.productId === stat.productId);
      
      await db.productPopularity.upsert({
        where: {
          productId_periodStart: {
            productId: stat.productId,
            periodStart: periodStart
          }
        },
        update: {
          monthlySalesCount: stat.monthly_count,
          totalRevenue: stat.revenue,
          weeklySalesCount: weekly?.weekly_count || 0,
          periodEnd: periodEnd,
          updatedAt: new Date()
        },
        create: {
          productId: stat.productId,
          monthlySalesCount: stat.monthly_count,
          weeklySalesCount: weekly?.weekly_count || 0,
          totalRevenue: stat.revenue,
          periodStart: periodStart,
          periodEnd: periodEnd
        }
      });
    }

    return NextResponse.json({ success: true, updated: monthlyStats.length });
  } catch (error) {
    console.error('Failed to run popularity cron:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
