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
import type { Prisma, StockChangeType } from '@prisma/client';

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
// CANONICAL STOCK MOVEMENT (single write path for every stock delta)
// ============================================================================

export interface StockMovementInput {
  businessId: string;
  productId: string;
  /** Signed quantity. Negative = outflow, positive = inflow. Never 0. */
  quantityChange: number;
  /** Per-unit cost of a receipt (updates WAC). Omit for a pure adjustment. */
  unitCost?: number | null;
  reason?: string;
  userId?: string;
  referenceId?: string;
  purchaseId?: string;
}

export interface StockMovementResult {
  productId: string;
  changeType: StockChangeType;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  buyingPrice: number;
}

/**
 * Apply one signed stock movement inside an existing transaction.
 *
 * This is the ONLY sanctioned way to move stock outside of a sale:
 * - locks the product row first (concurrent movements serialise),
 * - rejects an underflow loudly instead of silently doing nothing,
 * - updates WAC only for receipts that actually carry a unit cost,
 * - labels a movement honestly (PURCHASE vs ADJUSTMENT) so purchase reports
 *   do not absorb counting corrections,
 * - writes stock history + an audit row with the caller's transaction client.
 */
export async function applyStockMovementTx(
  tx: Prisma.TransactionClient,
  input: StockMovementInput,
): Promise<StockMovementResult> {
  const quantity = new Decimal(input.quantityChange);
  if (!Number.isFinite(input.quantityChange) || quantity.isZero()) {
    throw new DomainError(
      ERROR_CODES.INVALID_INPUT,
      'Stock movement quantity must be a non-zero finite number',
      400,
    );
  }

  const rows = await tx.$queryRaw<
    Array<{ id: string; currentStock: unknown; buyingPrice: unknown }>
  >`
    SELECT id, current_stock as "currentStock", buying_price as "buyingPrice"
    FROM products
    WHERE id = ${input.productId} AND business_id = ${input.businessId}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) {
    throw new DomainError(ERROR_CODES.PRODUCT_NOT_FOUND, 'Product not found', 404);
  }

  const stockBefore = new Decimal(String(row.currentStock));
  const available = stockBefore.gt(0) ? stockBefore : new Decimal(0);

  if (quantity.lt(0) && available.lt(quantity.abs())) {
    throw new DomainError(
      ERROR_CODES.INSUFFICIENT_STOCK,
      `Insufficient stock: available ${available.toString()}, requested ${quantity.abs().toString()}`,
      409,
      {
        productId: input.productId,
        available: available.toNumber(),
        requested: quantity.abs().toNumber(),
      },
    );
  }

  const unitCost = input.unitCost;
  const isReceipt = quantity.gt(0) && unitCost != null && Number.isFinite(unitCost);
  const changeType: StockChangeType = isReceipt ? 'PURCHASE' : 'ADJUSTMENT';

  let buyingPrice = Number(row.buyingPrice);
  if (isReceipt) {
    buyingPrice = await recalculateWAC(tx, input.productId, quantity.toNumber(), Number(unitCost));
  }

  const updated = await tx.product.update({
    where: { id: input.productId },
    data: {
      currentStock: { increment: quantity.toNumber() },
      ...(isReceipt ? { buyingPrice } : {}),
      updatedAt: new Date(),
    },
    select: { currentStock: true, buyingPrice: true },
  });

  await tx.stockHistory.create({
    data: {
      businessId: input.businessId,
      productId: input.productId,
      changeType,
      quantity: quantity.toNumber(),
      purchaseId: input.purchaseId ?? null,
      userId: input.userId ?? null,
      reason: input.reason ?? (isReceipt ? 'Stock receipt' : 'Stock adjustment'),
      referenceId: input.referenceId ?? null,
    },
  });

  await tx.auditLog.create({
    data: {
      businessId: input.businessId,
      userId: input.userId,
      action: isReceipt ? 'STOCK_ENTRY_CREATED' : 'STOCK_ADJUSTED',
      entityType: 'Product',
      entityId: input.productId,
      details: {
        changeType,
        quantity: quantity.toNumber(),
        stockBefore: stockBefore.toNumber(),
        stockAfter: Number(updated.currentStock),
        unitCost: isReceipt ? Number(unitCost) : null,
        reason: input.reason ?? null,
      },
    },
  });

  return {
    productId: input.productId,
    changeType,
    quantity: quantity.toNumber(),
    stockBefore: stockBefore.toNumber(),
    stockAfter: Number(updated.currentStock),
    buyingPrice: Number(updated.buyingPrice),
  };
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
