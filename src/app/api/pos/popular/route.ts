import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/api-middleware';

export async function GET(request: NextRequest) {
  // pos.view পারমিশন চেক করুন (যা সব ক্যাশিয়ারের আছে)
  const authResponse = await requirePermission(request, "pos.view");
  if (authResponse) return authResponse;

  try {
    // গত ৩০ দিনের সেল ডেটা ফেচ করুন
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const saleItems = await db.saleItem.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        sale: {
          status: { in: ["Completed", "PartialReturn"] }
        },
        quantity: { gt: 0 },
      },
      select: {
        productId: true,
        quantity: true,
      },
    });

    // প্রতিটি প্রোডাক্টের মোট বিক্রি হিসাব করুন
    const productSales = new Map<string, number>();
    for (const item of saleItems) {
      const qty = Number(item.quantity);
      productSales.set(
        item.productId,
        (productSales.get(item.productId) || 0) + qty
      );
    }

    // বিক্রির পরিমাণ অনুযায়ী সর্ট করুন (সর্বাধিক বিক্রিত উপরে)
    const topProducts = Array.from(productSales.entries())
      .map(([id, quantity]) => ({ id, quantity }))
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
