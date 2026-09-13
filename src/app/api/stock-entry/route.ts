export const dynamic = 'force-dynamic';
// ============================================================================
// Stock Entry API - Handle purchase/stock additions
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { StockEntryInputSchema } from '@/schemas';
import { requireAuth } from '@/lib/api-middleware';
import { requireBusinessContext, checkPermission } from '@/lib/tenant';
import { multiplyMoney, toMoneyNumber, toUnitPriceNumber } from '@/lib/money';
import { logAudit } from '@/lib/audit';
import Decimal from 'decimal.js';

// POST /api/stock-entry - Create stock entry (purchase)
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.authorized) return authResult.response;

  const ctx = await requireBusinessContext();
  if (ctx instanceof NextResponse) return ctx;

  const denied = checkPermission(ctx, 'stock.create');
  if (denied) return denied;

  const businessId = ctx.business.id;

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
      // Lock product row for concurrent stock/WAC safety scoped to business
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
        WHERE id = ${productId} AND business_id = ${businessId}
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

      const currencyRow = await tx.businessSetting.findFirst({
        where: { businessId, key: 'currency_symbol' },
      });
      const currencySymbol = currencyRow?.value || '₹';

      const stockHistory = await tx.stockHistory.create({
        data: {
          businessId,
          productId,
          changeType: 'purchase',
          quantity,
          reason: notes || `Stock purchase: ${quantity} units @ ${currencySymbol}${purchasePrice}`,
          referenceId: undefined,
        },
      });

      if (supplierId) {
        const supplier = await tx.supplier.findFirst({
          where: { id: supplierId, businessId },
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
              businessId,
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
                businessId,
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

    await logAudit({
      userId: ctx.user.id,
      businessId,
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
