export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/api-middleware';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';

export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, 'reports.view');
  if (authError) return authError;

  const sp = request.nextUrl.searchParams;
  const productId = sp.get('productId');
  if (!productId) return NextResponse.json({ error: 'productId required' }, { status: 400 });

  const days = parseInt(sp.get('days') || '30');
  const startDate = startOfDay(subDays(new Date(), days - 1));
  const endDate = endOfDay(new Date());

  try {
    const [product, stockHistory, saleItems] = await Promise.all([
      db.product.findUnique({
        where: { id: productId },
        select: {
          id: true, name: true, nameBn: true, category: true,
          buyingPrice: true, sellingPrice: true, unit: true,
          currentStock: true, minStockLevel: true, barcode: true,
          createdAt: true,
        },
      }),
      db.stockHistory.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true, changeType: true, quantity: true,
          reason: true, referenceId: true, createdAt: true,
        },
      }),
      db.saleItem.findMany({
        where: {
          productId,
          createdAt: { gte: startDate, lte: endDate },
          sale: { status: 'Completed' },
        },
        select: {
          quantity: true, unitPrice: true, totalPrice: true, createdAt: true,
          sale: { select: { invoiceNumber: true, createdAt: true, paymentMethod: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    // Daily sales breakdown
    const dailySalesMap = new Map<string, { qty: number; revenue: number }>();
    for (const item of saleItems) {
      const day = format(new Date(item.createdAt), 'yyyy-MM-dd');
      const existing = dailySalesMap.get(day) ?? { qty: 0, revenue: 0 };
      dailySalesMap.set(day, {
        qty: existing.qty + (item.quantity ?? 0),
        revenue: existing.revenue + Number(item.totalPrice ?? 0),
      });
    }
    // সব দিন দেখানোর জন্য — বিক্রি না থাকলেও 0 দিয়ে পূর্ণ করা
    const allDays = Array.from({ length: days }, (_, i) => {
      const d = subDays(new Date(), days - 1 - i);
      return format(d, 'yyyy-MM-dd');
    });
    const dailySales = allDays.map(date => ({
      date,
      ...(dailySalesMap.get(date) ?? { qty: 0, revenue: 0 }),
    }));

    // Hourly sales breakdown
    const hourlySalesMap = new Map<number, number>();
    for (const item of saleItems) {
      const hour = new Date(item.createdAt).getHours();
      hourlySalesMap.set(hour, (hourlySalesMap.get(hour) ?? 0) + (item.quantity ?? 0));
    }
    const hourlySales = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      qty: hourlySalesMap.get(h) ?? 0,
    }));

    const totalQtySold = saleItems.reduce((s, i) => s + (i.quantity ?? 0), 0);
    const totalRevenue = saleItems.reduce((s, i) => s + Number(i.totalPrice ?? 0), 0);
    const totalProfit = totalRevenue - Number(product.buyingPrice) * totalQtySold;
    const totalStockAdded = stockHistory
      .filter(h => h.quantity > 0)
      .reduce((s, h) => s + h.quantity, 0);

    return NextResponse.json({
      product,
      summary: { totalQtySold, totalRevenue, totalProfit, totalStockAdded },
      stockHistory,
      dailySales,
      hourlySales,
    });
  } catch (error: unknown) {
    console.error('Product stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch product statistics' }, { status: 500 });
  }
}
