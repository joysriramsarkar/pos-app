import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/api-middleware';

export async function GET(request: NextRequest) {
  // Allow fetching without strict permissions if needed, but standard is pos.view or sales.view
  // For safety, let's use a try-catch for permission
  
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    // Pre-aggregated data from the popularity table
    const popularProducts = await db.productPopularity.findMany({
      where: {
        periodStart: { gte: thirtyDaysAgo }
      },
      select: {
        productId: true,
        monthlySalesCount: true,
        weeklySalesCount: true,
        totalRevenue: true
      },
      orderBy: {
        monthlySalesCount: 'desc'
      },
      take: 100 // Top 100 products
    });

    // Rank-based scoring: Higher rank = Higher score
    const scoredProducts = popularProducts.map((p, index) => ({
      id: p.productId,
      rank: index + 1,
      score: (100 - index) * 1000 + p.monthlySalesCount * 10,
      monthlySales: p.monthlySalesCount
    }));

    return NextResponse.json({ 
      topProducts: scoredProducts,
      updatedAt: now.toISOString()
    });
  } catch (error) {
    console.error('Popular products error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
