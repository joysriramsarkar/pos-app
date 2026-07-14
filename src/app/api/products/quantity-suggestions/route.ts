import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/api-middleware';

export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, 'sales.view');
  if (authError) return authError;

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // Fetch Completed sale items in the last 30 days
    const saleItems = await db.saleItem.findMany({
      where: {
        sale: {
          createdAt: { gte: startDate },
          status: 'Completed',
        },
      },
      select: {
        productId: true,
        quantity: true,
      },
    });

    // Group by productId and quantity, count frequency
    const usage: Record<string, Record<string, number>> = {};

    for (const item of saleItems) {
      const pId = item.productId;
      const qtyStr = item.quantity.toString();

      if (!usage[pId]) {
        usage[pId] = {};
      }
      usage[pId][qtyStr] = (usage[pId][qtyStr] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      data: usage,
    });
  } catch (error) {
    console.error('Error fetching quantity suggestions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch quantity suggestions' },
      { status: 500 }
    );
  }
}
