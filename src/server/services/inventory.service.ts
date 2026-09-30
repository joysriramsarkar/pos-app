/**
 * Inventory Service — Domain logic for stock management
 *
 * Responsibilities:
 * - Stock adjustment with mandatory reason
 * - Stock ledger entries
 * - WAC (Weighted Average Cost) recalculation on purchase
 * - Low stock detection
 * - Opening stock setup
 */

import { db } from '@/lib/db';
import Decimal from 'decimal.js';
import { DomainError, ERROR_CODES } from '@/lib/domain-errors';
import type { StockChangeType } from '@prisma/client';

// ============================================================================
// INPUT TYPES
// ============================================================================

export type AdjustmentReason =
  | 'DAMAGED'
  | 'MISSING'
  | 'EXPIRED'
  | 'COUNTING_CORRECTION'
  | 'PERSONAL_USE'
  | 'OPENING_STOCK'
  | 'OTHER';

export interface StockAdjustmentInput {
  businessId: string;
  productId: string;
  newQuantity: number;
  reason: AdjustmentReason;
  notes?: string;
  userId?: string;
}

export interface PurchaseReceiveInput {
  businessId: string;
  purchaseId: string;
  items: Array<{
    productId: string;
    quantity: number;
    buyingPrice: number;
  }>;
  userId?: string;
}

// ============================================================================
// WAC CALCULATION
// ============================================================================

/**
 * Recalculate Weighted Average Cost after receiving stock.
 * WAC = (CurrentStock × CurrentCost + NewQty × NewCost) / (CurrentStock + NewQty)
 */
export async function recalculateWAC(
  tx: any,
  productId: string,
  newQuantity: number,
  newBuyingPrice: number
): Promise<number> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { currentStock: true, buyingPrice: true },
  });

  if (!product) return newBuyingPrice;

  const currentStock = new Decimal(product.currentStock);
  const currentCost = new Decimal(product.buyingPrice);
  const newQty = new Decimal(newQuantity);
  const newCost = new Decimal(newBuyingPrice);

  if (currentStock.lte(0)) {
    // No existing stock, just use new price
    return newBuyingPrice;
  }

  const totalValue = currentStock.mul(currentCost).plus(newQty.mul(newCost));
  const totalQty = currentStock.plus(newQty);

  return totalValue.div(totalQty).toDecimalPlaces(4).toNumber();
}

// ============================================================================
// STOCK ADJUSTMENT
// ============================================================================

/**
 * Adjust stock with mandatory reason and audit trail.
 *
 * The reason is required because financial audit requires knowing WHY
 * stock changed. This enforces the "stock adjustment reason" UI requirement.
 */
export async function adjustStock(input: StockAdjustmentInput): Promise<{
  product: { id: string; currentStock: number };
  stockEntry: { id: string; changeType: string; quantity: number };
}> {
  return db.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: input.productId, businessId: input.businessId },
      select: { id: true, name: true, currentStock: true },
    });

    if (!product) {
      throw new DomainError(ERROR_CODES.PRODUCT_NOT_FOUND, 'Product not found', 404);
    }

    const currentQty = new Decimal(product.currentStock);
    const newQty = new Decimal(input.newQuantity);
    const difference = newQty.minus(currentQty);

    // Update stock
    const updatedProduct = await tx.product.update({
      where: { id: input.productId },
      data: { currentStock: newQty.toNumber() },
      select: { id: true, currentStock: true },
    });

    // Create stock history entry
    const stockEntry = await tx.stockHistory.create({
      data: {
        businessId: input.businessId,
        productId: input.productId,
        changeType: 'ADJUSTMENT' as StockChangeType,
        quantity: difference.toNumber(),
        reason: `${input.reason}${input.notes ? `: ${input.notes}` : ''}`,
        userId: input.userId,
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        businessId: input.businessId,
        userId: input.userId,
        action: 'STOCK_ADJUSTMENT',
        entityType: 'Product',
        entityId: input.productId,
        details: {
          productName: product.name,
          before: currentQty.toNumber(),
          after: newQty.toNumber(),
          difference: difference.toNumber(),
          reason: input.reason,
          notes: input.notes,
        },
      },
    });

    return {
      product: { id: updatedProduct.id, currentStock: Number(updatedProduct.currentStock) },
      stockEntry: {
        id: stockEntry.id,
        changeType: stockEntry.changeType,
        quantity: Number(stockEntry.quantity),
      },
    };
  });
}

// ============================================================================
// RECEIVE PURCHASE
// ============================================================================

/**
 * Record receipt of purchased stock with WAC recalculation.
 * Updates product stock, recalculates WAC, creates stock history.
 */
export async function receivePurchase(input: PurchaseReceiveInput): Promise<void> {
  await db.$transaction(async (tx) => {
    const purchase = await tx.purchase.findFirst({
      where: { id: input.purchaseId, businessId: input.businessId },
      include: { items: true },
    });

    if (!purchase) {
      throw new DomainError(ERROR_CODES.PURCHASE_NOT_FOUND, 'Purchase not found', 404);
    }

    if (purchase.deliveryStatus === 'RECEIVED') {
      throw new DomainError(
        ERROR_CODES.ALREADY_RECEIVED,
        'This purchase has already been fully received',
        400
      );
    }

    for (const item of input.items) {
      // Recalculate WAC
      const newWAC = await recalculateWAC(tx, item.productId, item.quantity, item.buyingPrice);

      // Update product: increment stock + update WAC
      await tx.product.update({
        where: { id: item.productId },
        data: {
          currentStock: { increment: item.quantity },
          buyingPrice: newWAC,
        },
      });

      // Stock history entry
      await tx.stockHistory.create({
        data: {
          businessId: input.businessId,
          productId: item.productId,
          changeType: 'PURCHASE' as StockChangeType,
          quantity: item.quantity,
          purchaseId: input.purchaseId,
          userId: input.userId,
          reason: `Purchase received`,
        },
      });
    }

    // Update purchase delivery status
    await tx.purchase.update({
      where: { id: input.purchaseId },
      data: { deliveryStatus: 'RECEIVED' },
    });

    await tx.auditLog.create({
      data: {
        businessId: input.businessId,
        userId: input.userId,
        action: 'RECEIVE_PURCHASE',
        entityType: 'Purchase',
        entityId: input.purchaseId,
        details: { itemCount: input.items.length },
      },
    });
  });
}

// ============================================================================
// LOW STOCK DETECTION
// ============================================================================

/**
 * Get all products that are at or below minimum stock level.
 * Used by dashboard alerts.
 */
export async function getLowStockProducts(businessId: string): Promise<Array<{
  id: string;
  name: string;
  nameBn: string | null;
  currentStock: number;
  minStockLevel: number;
  category: string;
}>> {
  const products = await db.$queryRaw<any[]>`
    SELECT id, name, name_bn as "nameBn", current_stock as "currentStock",
           min_stock_level as "minStockLevel", category
    FROM products
    WHERE business_id = ${businessId}
      AND is_active = true
      AND current_stock <= min_stock_level
    ORDER BY (current_stock - min_stock_level) ASC
    LIMIT 100
  `;

  return products.map((p) => ({
    ...p,
    currentStock: Number(p.currentStock),
    minStockLevel: Number(p.minStockLevel),
  }));
}
