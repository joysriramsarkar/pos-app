/**
 * Supplier Service — Domain logic for supplier and purchase management
 *
 * Responsibilities:
 * - Supplier ledger management (mirrors customer ledger)
 * - Purchase workflow: Draft → Ordered → Received
 * - Supplier payment recording
 * - Payable summary
 */

import { db } from '@/lib/db';
import Decimal from 'decimal.js';
import { DomainError, ERROR_CODES } from '@/lib/domain-errors';
import type {
  Supplier,
  SupplierLedgerEntry,
  SupplierLedgerType,
  PurchaseDeliveryStatus,
  PurchasePaymentStatus,
  PaymentMethod,
} from '@prisma/client';

// ============================================================================
// SUPPLIER LEDGER
// ============================================================================

/**
 * Record a supplier ledger entry.
 *
 * PURCHASE: We owe more to supplier (increases payable)
 * PAYMENT:  We paid supplier (decreases payable)
 * RETURN:   Supplier credited us (decreases payable)
 * ADJUSTMENT: Manual correction
 */
export async function recordSupplierLedgerEntry(
  tx: any,
  businessId: string,
  supplierId: string,
  entryType: SupplierLedgerType,
  amount: number,
  referenceId?: string,
  description?: string
): Promise<SupplierLedgerEntry> {
  const supplier = await tx.supplier.findFirst({
    where: { id: supplierId, businessId },
    select: { id: true, totalDue: true },
  });

  if (!supplier) {
    throw new DomainError(ERROR_CODES.SUPPLIER_NOT_FOUND, 'Supplier not found', 404);
  }

  let newDue: Decimal;
  if (entryType === 'PURCHASE') {
    // We owe more
    newDue = new Decimal(supplier.totalDue).plus(amount);
  } else if (entryType === 'PAYMENT' || entryType === 'RETURN') {
    // We owe less
    newDue = new Decimal(supplier.totalDue).minus(amount);
  } else {
    // ADJUSTMENT - amount can be positive or negative
    newDue = new Decimal(supplier.totalDue).plus(amount);
  }

  // Update supplier running total
  await tx.supplier.update({
    where: { id: supplierId },
    data: {
      totalDue: newDue.toDecimalPlaces(2).toNumber(),
      ...(entryType === 'PAYMENT' ? { totalPaid: { increment: amount } } : {}),
    },
  });

  // Create ledger entry
  return tx.supplierLedgerEntry.create({
    data: {
      businessId,
      supplierId,
      entryType,
      amount,
      balanceAfter: newDue.toDecimalPlaces(2).toNumber(),
      description,
      referenceId,
    },
  });
}

// ============================================================================
// CREATE PURCHASE
// ============================================================================

export interface CreatePurchaseInput {
  businessId: string;
  supplierId?: string;
  invoiceNumber?: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    buyingPrice: number;
  }>;
  paidAmount?: number;
  paymentMethod?: PaymentMethod;
  notes?: string;
  userId?: string;
}

export async function createPurchase(input: CreatePurchaseInput): Promise<{
  purchaseId: string;
  totalAmount: number;
  dueAmount: number;
}> {
  return db.$transaction(async (tx) => {
    // Calculate total
    const totalAmount = input.items.reduce(
      (sum, item) => sum + item.quantity * item.buyingPrice,
      0
    );
    const paidAmount = input.paidAmount ?? 0;
    const dueAmount = totalAmount - paidAmount;

    const paymentStatus: PurchasePaymentStatus =
      paidAmount >= totalAmount ? 'PAID' :
      paidAmount > 0 ? 'PARTIAL' : 'PENDING';

    // Create purchase record
    const purchase = await tx.purchase.create({
      data: {
        businessId: input.businessId,
        supplierId: input.supplierId,
        invoiceNumber: input.invoiceNumber,
        totalAmount,
        paidAmount,
        paymentStatus,
        deliveryStatus: 'RECEIVED', // Simple flow: create = received
        paymentMethod: input.paymentMethod ?? 'CASH',
        notes: input.notes,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            receivedQty: item.quantity,
            buyingPrice: item.buyingPrice,
            totalPrice: item.quantity * item.buyingPrice,
          })),
        },
      },
    });

    // Update stock and WAC for each item
    for (const item of input.items) {
      // Get current product
      const product = await tx.product.findFirst({
        where: { id: item.productId, businessId: input.businessId },
        select: { currentStock: true, buyingPrice: true },
      });

      if (!product) {
        throw new DomainError(
          ERROR_CODES.PRODUCT_NOT_FOUND,
          `Product ${item.productId} not found`,
          404
        );
      }

      // Recalculate WAC
      const currentStock = new Decimal(product.currentStock);
      const currentCost = new Decimal(product.buyingPrice);
      const newQty = new Decimal(item.quantity);
      const newCost = new Decimal(item.buyingPrice);

      let newWAC: number;
      if (currentStock.lte(0)) {
        newWAC = item.buyingPrice;
      } else {
        const totalValue = currentStock.mul(currentCost).plus(newQty.mul(newCost));
        const totalQty = currentStock.plus(newQty);
        newWAC = totalValue.div(totalQty).toDecimalPlaces(4).toNumber();
      }

      await tx.product.update({
        where: { id: item.productId },
        data: {
          currentStock: { increment: item.quantity },
          buyingPrice: newWAC,
        },
      });

      await tx.stockHistory.create({
        data: {
          businessId: input.businessId,
          productId: item.productId,
          changeType: 'PURCHASE',
          quantity: item.quantity,
          purchaseId: purchase.id,
          userId: input.userId,
        },
      });
    }

    // Update supplier ledger if supplier is selected
    if (input.supplierId && dueAmount > 0) {
      await recordSupplierLedgerEntry(
        tx,
        input.businessId,
        input.supplierId,
        'PURCHASE',
        dueAmount,
        purchase.id,
        `Purchase ${input.invoiceNumber || purchase.id}`
      );
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        businessId: input.businessId,
        userId: input.userId,
        action: 'CREATE_PURCHASE',
        entityType: 'Purchase',
        entityId: purchase.id,
        details: {
          invoiceNumber: input.invoiceNumber,
          totalAmount,
          paidAmount,
          itemCount: input.items.length,
        },
      },
    });

    return {
      purchaseId: purchase.id,
      totalAmount,
      dueAmount,
    };
  });
}

// ============================================================================
// RECORD SUPPLIER PAYMENT
// ============================================================================

export interface SupplierPaymentInput {
  businessId: string;
  supplierId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
  userId?: string;
  purchaseId?: string; // If paying against a specific purchase
}

export async function recordSupplierPayment(input: SupplierPaymentInput): Promise<void> {
  await db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, businessId: input.businessId },
      select: { id: true, name: true, totalDue: true },
    });

    if (!supplier) {
      throw new DomainError(ERROR_CODES.SUPPLIER_NOT_FOUND, 'Supplier not found', 404);
    }

    // Record ledger entry
    await recordSupplierLedgerEntry(
      tx,
      input.businessId,
      input.supplierId,
      'PAYMENT',
      input.amount,
      input.purchaseId,
      input.notes
    );

    // If paying against a specific purchase, update its paid amount
    if (input.purchaseId) {
      const purchase = await tx.purchase.findFirst({
        where: { id: input.purchaseId, businessId: input.businessId },
        select: { id: true, totalAmount: true, paidAmount: true },
      });

      if (purchase) {
        const newPaid = new Decimal(purchase.paidAmount).plus(input.amount);
        const total = new Decimal(purchase.totalAmount);
        const newStatus: PurchasePaymentStatus =
          newPaid.gte(total) ? 'PAID' : 'PARTIAL';

        await tx.purchase.update({
          where: { id: input.purchaseId },
          data: {
            paidAmount: newPaid.toNumber(),
            paymentStatus: newStatus,
          },
        });
      }
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        businessId: input.businessId,
        userId: input.userId,
        action: 'SUPPLIER_PAYMENT',
        entityType: 'Supplier',
        entityId: input.supplierId,
        details: {
          supplierName: supplier.name,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          purchaseId: input.purchaseId,
        },
      },
    });
  });
}

// ============================================================================
// PAYABLE SUMMARY
// ============================================================================

/**
 * Get supplier-wise payable summary.
 * Used in dashboard alerts and reports.
 */
export async function getPayableSummary(businessId: string): Promise<Array<{
  supplierId: string;
  supplierName: string;
  totalDue: number;
}>> {
  const suppliers = await db.supplier.findMany({
    where: {
      businessId,
      isActive: true,
      totalDue: { gt: 0 },
    },
    select: {
      id: true,
      name: true,
      totalDue: true,
    },
    orderBy: { totalDue: 'desc' },
  });

  return suppliers.map((s) => ({
    supplierId: s.id,
    supplierName: s.name,
    totalDue: Number(s.totalDue),
  }));
}
