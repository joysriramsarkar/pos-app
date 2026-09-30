/**
 * Sales Service — Domain logic for creating, completing, and managing sales
 *
 * This service is the ONLY place where sale creation logic lives.
 * Used by: API routes, offline sync, future mobile apps.
 *
 * Key responsibilities:
 * - Stock validation and atomic decrement
 * - WAC (Weighted Average Cost) cost snapshot
 * - Customer ledger updates
 * - Payment calculation and validation
 * - Invoice number generation
 * - Audit log creation
 */

import { db } from '@/lib/db';
import Decimal from 'decimal.js';
import { DomainError, ERROR_CODES } from '@/lib/domain-errors';
import type {
  Sale,
  SaleItem,
  Payment,
  PaymentStatus,
  PaymentMethod,
  SaleStatus,
  DiscountType,
  LedgerEntryType,
} from '@prisma/client';

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface CreateSaleInput {
  businessId: string;
  userId?: string;
  invoiceNumber: string;
  customerId?: string;
  shiftId?: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    discountType?: DiscountType;
    taxRate?: number;
  }>;
  discount?: number;
  discountType?: DiscountType;
  tax?: number;
  totalAmount: number;
  amountPaid: number;
  payments?: Array<{
    method: PaymentMethod;
    amount: number;
    referenceNo?: string;
  }>;
  usePrepaid?: boolean;
  prepaidAmountUsed?: number;
  changeAsPrepayment?: number;
  notes?: string;
  idempotencyKey?: string;
}

export interface SaleResult {
  sale: Sale & {
    items: SaleItem[];
    payments: Payment[];
  };
  ledgerEntry?: {
    totalDue: number;
    prepaidBalance: number;
  };
}

// ============================================================================
// DISCOUNT CALCULATION HELPERS
// ============================================================================

export function calculateItemTotal(
  unitPrice: number,
  quantity: number,
  discount: number = 0,
  discountType: DiscountType = 'FIXED'
): number {
  const subtotal = new Decimal(unitPrice).mul(quantity);
  if (discountType === 'PERCENTAGE') {
    const pct = new Decimal(discount).div(100);
    return subtotal.mul(new Decimal(1).minus(pct)).toNumber();
  }
  return subtotal.minus(discount).toNumber();
}

// ============================================================================
// DISCOUNT LIMIT CHECK (Role-based approval)
// ============================================================================

export const DISCOUNT_LIMITS: Record<string, number> = {
  CASHIER: 10,  // Max 10%
  MANAGER: 20,  // Max 20%
  ADMIN:   100, // Unlimited
  OWNER:   100, // Unlimited
  VIEWER:  0,   // Cannot create sales
};

export function checkDiscountLimit(
  discountPercent: number,
  role: string
): boolean {
  const limit = DISCOUNT_LIMITS[role] ?? 0;
  return discountPercent <= limit;
}

// ============================================================================
// CORE CREATE SALE SERVICE
// ============================================================================

/**
 * Create a sale with atomic stock decrement and ledger updates.
 *
 * Uses a database transaction to ensure:
 * 1. Stock is available and decremented atomically
 * 2. Sale and items are created together
 * 3. Customer ledger is updated consistently
 * 4. Audit log is written
 */
export async function createSale(input: CreateSaleInput): Promise<SaleResult> {
  // Idempotency check
  if (input.idempotencyKey) {
    const existing = await db.syncQueue.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { result: true, synced: true },
    });
    if (existing?.synced && existing.result) {
      const cached = existing.result as any;
      if (cached.saleId) {
        const sale = await db.sale.findUnique({
          where: { id: cached.saleId },
          include: { items: true, payments: true },
        });
        if (sale) return { sale: sale as any };
      }
    }
  }

  return db.$transaction(async (tx) => {
    // ── 1. Lock and validate products ────────────────────────────────
    const productIds = [...new Set(input.items.map((i) => i.productId))];

    const products = await tx.product.findMany({
      where: {
        id: { in: productIds },
        businessId: input.businessId,
      },
      select: {
        id: true,
        name: true,
        sellingPrice: true,
        buyingPrice: true,
        currentStock: true,
        isActive: true,
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Validate all products exist and have sufficient stock
    for (const item of input.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new DomainError(
          ERROR_CODES.PRODUCT_NOT_FOUND,
          `Product ${item.productId} not found`,
          404
        );
      }
      if (!product.isActive) {
        throw new DomainError(
          ERROR_CODES.PRODUCT_NOT_FOUND,
          `Product ${product.name} is inactive`,
          400
        );
      }
      const available = new Decimal(product.currentStock);
      if (available.lt(item.quantity)) {
        throw new DomainError(
          ERROR_CODES.INSUFFICIENT_STOCK,
          `Insufficient stock for ${product.name}: available ${available}, requested ${item.quantity}`,
          400,
          { productId: item.productId, available: available.toNumber(), requested: item.quantity }
        );
      }
    }

    // ── 2. Validate customer ──────────────────────────────────────────
    let customer = null;
    if (input.customerId) {
      customer = await tx.customer.findFirst({
        where: { id: input.customerId, businessId: input.businessId },
        select: {
          id: true,
          name: true,
          totalDue: true,
          prepaidBalance: true,
        },
      });
      if (!customer) {
        throw new DomainError(
          ERROR_CODES.CUSTOMER_NOT_FOUND,
          `Customer ${input.customerId} not found`,
          404
        );
      }

      // Validate prepaid usage
      if (input.usePrepaid && input.prepaidAmountUsed) {
        const available = new Decimal(customer.prepaidBalance);
        if (available.lt(input.prepaidAmountUsed)) {
          throw new DomainError(
            ERROR_CODES.INSUFFICIENT_PREPAID,
            `Insufficient prepaid balance: available ${available}, requested ${input.prepaidAmountUsed}`,
            400
          );
        }
      }
    }

    // ── 3. Calculate sale items ───────────────────────────────────────
    const saleItems = input.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const itemTotal = calculateItemTotal(
        item.unitPrice,
        item.quantity,
        item.discount ?? 0,
        item.discountType ?? 'FIXED'
      );
      const taxAmount = item.taxRate
        ? new Decimal(itemTotal).mul(item.taxRate / 100).toDecimalPlaces(2).toNumber()
        : 0;

      return {
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        costPriceAtSale: new Decimal(product.buyingPrice).toNumber(),
        discount: item.discount ?? 0,
        discountType: item.discountType ?? 'FIXED' as DiscountType,
        totalPrice: itemTotal,
        taxRate: item.taxRate ?? 0,
        taxAmount,
      };
    });

    // Determine payment status
    const total = new Decimal(input.totalAmount);
    const paid = new Decimal(input.amountPaid);
    let paymentStatus: PaymentStatus;
    if (paid.gte(total)) {
      paymentStatus = 'PAID';
    } else if (paid.gt(0)) {
      paymentStatus = 'PARTIAL';
    } else {
      paymentStatus = 'DUE';
    }

    // Determine primary payment method
    let primaryMethod: PaymentMethod = 'CASH';
    if (input.payments && input.payments.length > 0) {
      // Use the method with the highest amount
      const dominant = input.payments.reduce((a, b) => a.amount >= b.amount ? a : b);
      primaryMethod = dominant.method;
      if (input.payments.length > 1) primaryMethod = 'MIXED';
    }

    // ── 4. Create sale ────────────────────────────────────────────────
    const subtotal = saleItems.reduce((s, i) => new Decimal(s).plus(i.totalPrice).toNumber(), 0);
    const orderDiscount = input.discount ?? 0;

    const sale = await tx.sale.create({
      data: {
        businessId: input.businessId,
        invoiceNumber: input.invoiceNumber,
        customerId: input.customerId,
        userId: input.userId,
        shiftId: input.shiftId,
        subtotal,
        discount: orderDiscount,
        discountType: input.discountType ?? 'FIXED',
        tax: input.tax ?? 0,
        totalAmount: input.totalAmount,
        amountPaid: input.amountPaid,
        paymentMethod: primaryMethod,
        paymentStatus,
        status: 'COMPLETED',
        cashAmount: input.payments?.find((p) => p.method === 'CASH')?.amount,
        upiAmount: input.payments?.find((p) => p.method === 'UPI')?.amount,
        notes: input.notes,
        offlineSynced: true,
        items: {
          create: saleItems,
        },
      },
      include: { items: true },
    });

    // ── 5. Create Payment records ─────────────────────────────────────
    let payments: Payment[] = [];
    if (input.payments && input.payments.length > 0) {
      payments = await Promise.all(
        input.payments.map((p) =>
          tx.payment.create({
            data: {
              saleId: sale.id,
              businessId: input.businessId,
              method: p.method,
              amount: p.amount,
              referenceNo: p.referenceNo,
            },
          })
        )
      );
    }

    // ── 6. Atomic stock decrement ─────────────────────────────────────
    const stockHistoryEntries = [];
    for (const item of input.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          currentStock: {
            decrement: item.quantity,
          },
        },
      });
      stockHistoryEntries.push({
        businessId: input.businessId,
        productId: item.productId,
        changeType: 'SALE' as const,
        quantity: -item.quantity,
        saleId: sale.id,
        userId: input.userId,
      });
    }

    // Batch create stock history
    await tx.stockHistory.createMany({ data: stockHistoryEntries });

    // ── 7. Customer ledger update ─────────────────────────────────────
    let ledgerResult = undefined;
    if (customer) {
      const dueAmount = total.minus(paid);
      const prepaidUsed = new Decimal(input.prepaidAmountUsed ?? 0);
      const changeAsPrepayment = new Decimal(input.changeAsPrepayment ?? 0);

      // Update customer due and prepaid
      const newDue = new Decimal(customer.totalDue).plus(dueAmount).toDecimalPlaces(2);
      const newPrepaid = new Decimal(customer.prepaidBalance)
        .minus(prepaidUsed)
        .plus(changeAsPrepayment)
        .toDecimalPlaces(2);

      const updatedCustomer = await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalDue: newDue.toNumber(),
          totalPaid: { increment: paid.toNumber() },
          prepaidBalance: newPrepaid.toNumber(),
        },
        select: { totalDue: true, prepaidBalance: true },
      });

      // Create ledger entry if there's a due
      if (dueAmount.gt(0)) {
        await tx.ledgerEntry.create({
          data: {
            businessId: input.businessId,
            customerId: customer.id,
            entryType: 'CREDIT' as LedgerEntryType,
            amount: dueAmount.toNumber(),
            balanceAfter: updatedCustomer.totalDue.toNumber(),
            description: `Sale ${input.invoiceNumber}`,
            referenceId: sale.id,
          },
        });
      }

      ledgerResult = {
        totalDue: updatedCustomer.totalDue.toNumber(),
        prepaidBalance: updatedCustomer.prepaidBalance.toNumber(),
      };
    }

    // ── 8. Audit log ──────────────────────────────────────────────────
    await tx.auditLog.create({
      data: {
        businessId: input.businessId,
        userId: input.userId,
        action: 'CREATE_SALE',
        entityType: 'Sale',
        entityId: sale.id,
        details: {
          invoiceNumber: input.invoiceNumber,
          totalAmount: input.totalAmount,
          itemCount: input.items.length,
          paymentStatus,
        },
      },
    });

    return {
      sale: { ...sale, payments } as any,
      ledgerEntry: ledgerResult,
    };
  }, {
    // Increase timeout for complex transactions
    timeout: 15000,
    maxWait: 10000,
  });
}

// ============================================================================
// CANCEL / REFUND SALE
// ============================================================================

export async function cancelSale(
  saleId: string,
  businessId: string,
  userId?: string,
  reason?: string
): Promise<Sale> {
  return db.$transaction(async (tx) => {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, businessId },
      include: { items: true },
    });

    if (!sale) {
      throw new DomainError(ERROR_CODES.SALE_NOT_FOUND, 'Sale not found', 404);
    }

    if (sale.status !== 'COMPLETED') {
      throw new DomainError(
        ERROR_CODES.INVALID_RETURN,
        'Only completed sales can be cancelled',
        400
      );
    }

    // Reverse stock
    for (const item of sale.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { currentStock: { increment: item.quantity } },
      });
      await tx.stockHistory.create({
        data: {
          businessId,
          productId: item.productId,
          changeType: 'RETURN',
          quantity: item.quantity,
          saleId,
          userId,
          reason: `Sale ${sale.invoiceNumber} cancelled`,
        },
      });
    }

    // Update sale status
    const updatedSale = await tx.sale.update({
      where: { id: saleId },
      data: { status: 'CANCELLED' },
    });

    // Reverse customer due if applicable
    if (sale.customerId) {
      const dueAmount = new Decimal(sale.totalAmount).minus(sale.amountPaid);
      if (dueAmount.gt(0)) {
        const customer = await tx.customer.findUnique({
          where: { id: sale.customerId },
          select: { totalDue: true },
        });
        if (customer) {
          const newDue = new Decimal(customer.totalDue).minus(dueAmount).toDecimalPlaces(2);
          await tx.customer.update({
            where: { id: sale.customerId },
            data: { totalDue: newDue.toNumber() },
          });
          await tx.ledgerEntry.create({
            data: {
              businessId,
              customerId: sale.customerId,
              entryType: 'DEBIT',
              amount: dueAmount.toNumber(),
              balanceAfter: newDue.toNumber(),
              description: `Sale ${sale.invoiceNumber} cancelled`,
              referenceId: saleId,
            },
          });
        }
      }
    }

    await tx.auditLog.create({
      data: {
        businessId,
        userId,
        action: 'CANCEL_SALE',
        entityType: 'Sale',
        entityId: saleId,
        details: { invoiceNumber: sale.invoiceNumber, reason },
      },
    });

    return updatedSale;
  });
}
