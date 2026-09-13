import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-middleware';
import { requireBusinessContext, checkPermission } from '@/lib/tenant';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, "sales.view");
  if (denied) return denied;

  const businessId = ctx.business.id;

  try {
    // গত ৩০ দিনের সেল ডেটা ফেচ করুন
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const saleItems = await db.saleItem.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        sale: {
          businessId,
          status: { in: ["Completed", "PartialReturn"] }
        },
        quantity: { gt: 0 },
      },
      select: {
        productId: true,
      },
    });

    // প্রতিটি প্রোডাক্ট কতবার কার্টে যুক্ত হয়েছে (frequency) তা হিসাব করুন
    const productFrequency = new Map<string, number>();
    for (const item of saleItems) {
      productFrequency.set(
        item.productId,
        (productFrequency.get(item.productId) || 0) + 1
      );
    }

    // কার্টে যুক্ত হওয়ার পরিমাণ অনুযায়ী সর্ট করুন (সর্বাধিক বার যুক্ত হওয়া উপরে)
    const topProducts = Array.from(productFrequency.entries())
      .map(([id, frequency]) => ({ id, quantity: frequency }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 50); // শুধুমাত্র টপ ৫০

    return NextResponse.json({ topProducts });
  } catch (error) {
    console.error('Popular products error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch popular products' },
      { status: 500 }
    );
  }
}
