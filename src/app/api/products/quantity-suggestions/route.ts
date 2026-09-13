import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-middleware';
import { requireBusinessContext, checkPermission } from '@/lib/tenant';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, 'sales.view');
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // Fetch Completed sale items in the last 30 days for this business
    const saleItems = await db.saleItem.findMany({
      where: {
        sale: {
          businessId,
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
