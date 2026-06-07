export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { StockAdjustmentInputSchema } from '@/schemas';
import { requirePermission, getAuthenticatedUser } from '@/lib/api-middleware';
import { logAudit } from '@/lib/audit';

const ADJUSTMENT_LABELS: Record<string, string> = {
  home_consumption: 'বাড়ির খরচ',
  damaged: 'নষ্ট/ড্যামেজ',
  expired: 'মেয়াদ উত্তীর্ণ',
  other: 'অন্যান্য',
};

export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, 'stock.edit');
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });

    const result = StockAdjustmentInputSchema.safeParse(body);
    if (!result.success) {
      const errors = Object.values(result.error.flatten().fieldErrors).flat().join(', ');
      return NextResponse.json({ success: false, error: errors || 'Validation failed' }, { status: 400 });
    }

    const { productId, quantity, adjustmentType, reason } = result.data;

    const updatedProduct = await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error(`Product ${productId} not found`);

      if (Number(product.currentStock) < quantity) {
        throw new Error(`অপর্যাপ্ত স্টক। বর্তমান স্টক: ${product.currentStock} ${product.unit}`);
      }

      const updated = await tx.product.update({
        where: { id: productId },
        data: { currentStock: { decrement: quantity }, updatedAt: new Date() },
      });

      await tx.stockHistory.create({
        data: {
          productId,
          changeType: 'adjustment',
          quantity: -quantity, // নেগেটিভ = স্টক কমছে
          reason: `[${ADJUSTMENT_LABELS[adjustmentType]}] ${reason}`,
        },
      });

      return updated;
    });

    const user = await getAuthenticatedUser(request);
    await logAudit({
      userId: (user as any)?.id,
      action: 'STOCK_ADJUSTMENT',
      entityType: 'Product',
      entityId: updatedProduct.id,
      details: { productName: updatedProduct.name, quantity: -quantity, adjustmentType, reason },
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: updatedProduct,
      message: `${updatedProduct.name} থেকে ${quantity} ${updatedProduct.unit} বাদ দেওয়া হয়েছে।`,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to adjust stock' },
      { status: 500 }
    );
  }
}
