export const dynamic = 'force-dynamic';
// ============================================================================
// Stock Entry API - Handle purchase/stock additions
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { StockEntryInputSchema } from '@/schemas';
import { requirePermission, getAuthenticatedUser } from '@/lib/api-middleware';
import { multiplyMoney, toMoneyNumber, toUnitPriceNumber } from '@/lib/money';
import { logAudit } from '@/lib/audit';
import Decimal from 'decimal.js';

// POST /api/stock-entry - Create stock entry (purchase)
export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, 'stock.edit');
  if (authError) return authError;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body: JSON parsing failed' },
        { status: 400 },
      );
    }

    const result = StockEntryInputSchema.safeParse(body);
    if (!result.success) {
      const errors = Object.values(result.error.flatten().fieldErrors)
        .flat()
        .join(', ');
      return NextResponse.json(
        { success: false, error: errors || 'Validation failed' },
        { status: 400 },
      );
    }

    const { productId, quantity, purchasePrice, date, supplierId, amountPaid, notes } = result.data;

    const transactionResult = await db.$transaction(async (tx) => {
      // Lock product row for concurrent stock/WAC safety
      const locked = await tx.$queryRaw<
        Array<{
          id: string;
          name: string;
          current_stock: unknown;
          buying_price: unknown;
        }>
      >`
        SELECT id, name, "current_stock", "buying_price"
        FROM products
        WHERE id = ${productId}
        FOR UPDATE
      `;

      const productRow = locked[0];
      if (!productRow) {
        throw new Error(`Product ${productId} not found`);
      }

      const currentStock = Number(productRow.current_stock) || 0;
      const updateData: {
        currentStock: { increment: number };
        updatedAt: Date;
        buyingPrice?: number;
      } = {
        currentStock: { increment: quantity },
        updatedAt: new Date(),
      };

      if (purchasePrice !== undefined && purchasePrice !== null) {
        const newStock = currentStock + quantity;
        if (newStock > 0) {
          const currentPrice =
            productRow.buying_price !== null && productRow.buying_price !== undefined
              ? Number(productRow.buying_price)
              : purchasePrice;
          const wac = (currentStock * currentPrice + quantity * purchasePrice) / newStock;
          updateData.buyingPrice = toUnitPriceNumber(wac);
        } else {
          updateData.buyingPrice = toUnitPriceNumber(purchasePrice);
        }
      }

      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: updateData,
      });

      const stockHistory = await tx.stockHistory.create({
        data: {
          productId,
          changeType: 'purchase',
          quantity,
          reason: notes || `Stock purchase: ${quantity} units @ ₹${purchasePrice}`,
          referenceId: undefined,
        },
      });

      if (supplierId) {
        const supplier = await tx.supplier.findUnique({
          where: { id: supplierId },
        });

        if (supplier) {
          const totalAmount = multiplyMoney(quantity, purchasePrice);
          const actualAmountPaid =
            amountPaid !== undefined ? new Decimal(amountPaid) : totalAmount;

          let paymentStatus = 'Paid';
          if (actualAmountPaid.lte(0)) {
            paymentStatus = 'Pending';
          } else if (actualAmountPaid.lt(totalAmount)) {
            paymentStatus = 'Partial';
          }

          const purchase = await tx.purchase.create({
            data: {
              supplierId,
              invoiceNumber: `PUR-${Date.now()}`,
              totalAmount,
              paidAmount: toMoneyNumber(actualAmountPaid),
              paymentStatus,
              notes,
              items: {
                create: {
                  productId,
                  productName: productRow.name,
                  quantity,
                  buyingPrice: purchasePrice,
                  totalPrice: totalAmount,
                },
              },
            },
            include: { items: true },
          });

          await tx.stockHistory.update({
            where: { id: stockHistory.id },
            data: {
              referenceId: purchase.id,
              purchaseId: purchase.id,
            },
          });

          if (actualAmountPaid.gt(0)) {
            await tx.expense.create({
              data: {
                amount: actualAmountPaid,
                category: 'Supplier Payment',
                notes: notes || `Paid for stock: ${quantity} units of ${productRow.name}`,
                date: date ? new Date(date) : new Date(),
                supplierId,
                supplierName: supplier.name,
              },
            });
          }
        }
      }

      return updatedProduct;
    });

    const user = await getAuthenticatedUser(request);
    const userId = (user as { id?: string } | null)?.id;
    await logAudit({
      userId,
      action: 'STOCK_ENTRY',
      entityType: 'Product',
      entityId: transactionResult.id,
      details: { productName: transactionResult.name, quantity, purchasePrice, supplierId },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: transactionResult,
      message: `Stock updated: ${quantity} units added to ${transactionResult.name}`,
    });
  } catch (error: unknown) {
    console.error('Error creating stock entry:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create stock entry',
      },
      { status: 500 },
    );
  }
}
