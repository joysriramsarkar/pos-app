export const dynamic = 'force-dynamic';
// ============================================================================
// Stock Entry API - Handle purchase/stock additions
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { StockEntryInputSchema } from '@/schemas';
import { requirePermission, getAuthenticatedUser } from '@/lib/api-middleware';
import { multiplyMoney, toMoneyNumber } from '@/lib/money';
import { logAudit } from '@/lib/audit';

const getIp = (req: NextRequest) => req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

// POST /api/stock-entry - Create stock entry (purchase)
export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, 'stock.edit');
  if (authError) return authError;

  try {
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body: JSON parsing failed' },
        { status: 400 }
      );
    }

    // Validate with Zod
    const result = StockEntryInputSchema.safeParse(body);
    if (!result.success) {
      const errors = Object.values(result.error.flatten().fieldErrors)
        .flat()
        .join(', ');
      return NextResponse.json(
        { success: false, error: errors || 'Validation failed' },
        { status: 400 }
      );
    }

    const { productId, quantity, purchasePrice, date, supplierId, amountPaid, notes } = result.data;

    // Update stock in transaction
    const transactionResult = await db.$transaction(async (tx) => {
      // Verify product exists
      const product = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        throw new Error(`Product ${productId} not found`);
      }

      // Increment stock
      // build update data dynamically so we only touch buyingPrice when provided
      const updateData: any = {
        currentStock: { increment: quantity },
        updatedAt: new Date(),
      };

      if (purchasePrice !== undefined && purchasePrice !== null) {
        // Calculate the Weighted Average Cost (WAC)
        const currentStock = Number(product.currentStock) || 0; // Handle null/undefined
        const newStock = currentStock + quantity;

        // Handle division by zero edge case (though newStock should be > 0 since quantity > 0)
        if (newStock > 0) {
          const currentPrice = Number(product.buyingPrice) || purchasePrice; // Fallback to new price if old is null
          const wac = ((currentStock * currentPrice) + (quantity * purchasePrice)) / newStock;
          updateData.buyingPrice = toMoneyNumber(wac);
        } else {
          updateData.buyingPrice = toMoneyNumber(purchasePrice);
        }
      }

      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: updateData,
      });

      // Create StockHistory record for audit trail
      const stockHistory = await tx.stockHistory.create({
        data: {
          productId,
          changeType: 'purchase',
          quantity, // Positive number for addition
          reason: notes || `Stock purchase: ${quantity} units @ ₹${purchasePrice}`,
          referenceId: undefined, // Will be set after purchase creation
        },
      });

      // Optionally create Purchase record if supplierId provided
      if (supplierId) {
        // Verify supplier exists before creating purchase
        const supplier = await tx.supplier.findUnique({
          where: { id: supplierId },
        });

        if (supplier) {
          const totalAmount = multiplyMoney(quantity, purchasePrice);
          const actualAmountPaid = amountPaid !== undefined ? amountPaid : totalAmount;
          const paymentStatus = 'Paid';

          const purchase = await tx.purchase.create({
            data: {
              supplierId,
              invoiceNumber: `PUR-${Date.now()}`,
              totalAmount,
              paymentStatus,
              notes,
              items: {
                create: {
                  productId,
                  productName: product.name,
                  quantity,
                  buyingPrice: purchasePrice,
                  totalPrice: totalAmount,
                },
              },
            },
            include: { items: true },
          });

          // Update StockHistory to link to Purchase using the record ID we have
          await tx.stockHistory.update({
            where: {
              id: stockHistory.id,
            },
            data: {
              referenceId: purchase.id,
            },
          });

          // Create Expense record for payment if amountPaid > 0
          if (actualAmountPaid > 0) {
            await tx.expense.create({
              data: {
                amount: actualAmountPaid,
                category: 'Supplier Payment',
                notes: notes || `Paid for stock: ${quantity} units of ${product.name}`,
                date: date ? new Date(date) : new Date(),
                supplierId,
                supplierName: supplier.name,
              },
            });
          }
        }
        // If supplier doesn't exist, just skip purchase creation and only update stock
      }

      return updatedProduct;
    });

    const user = await getAuthenticatedUser(request);
    const userId = (user as any)?.id;
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
        error: error instanceof Error ? error.message : 'Failed to create stock entry' 
      },
      { status: 500 }
    );
  }
}

