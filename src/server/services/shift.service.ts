/**
 * Cash Register / Shift Service — Domain logic for daily shift management
 *
 * A "shift" represents one cashier's working session at the POS.
 * Each shift tracks:
 * - Opening cash balance
 * - All sales that occurred during the shift
 * - Total expenses and refunds
 * - Closing cash count
 * - Cash difference (overage/shortage)
 *
 * This enables the "Day Closing" feature from the plan.
 */

import { db } from '@/lib/db';
import Decimal from 'decimal.js';
import { DomainError, ERROR_CODES } from '@/lib/domain-errors';
import type { CashRegisterShift } from '@prisma/client';

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface OpenShiftInput {
  businessId: string;
  userId: string;
  openingCash: number;
  notes?: string;
}

export interface CloseShiftInput {
  shiftId: string;
  businessId: string;
  userId: string;
  actualCash: number;
  notes?: string;
}

export interface ShiftSummary {
  shift: CashRegisterShift;
  totalSalesCash: number;
  totalSalesUPI: number;
  totalSalesOther: number;
  totalSales: number;
  totalExpenses: number;
  totalRefunds: number;
  expectedCash: number;
  actualCash?: number;
  difference?: number;
  saleCount: number;
}

// ============================================================================
// OPEN SHIFT
// ============================================================================

/**
 * Open a new cash register shift.
 * Only one shift can be open per business at a time.
 */
export async function openShift(input: OpenShiftInput): Promise<CashRegisterShift> {
  return db.$transaction(async (tx) => {
    // Check no shift is already open
    const existingOpen = await tx.cashRegisterShift.findFirst({
      where: { businessId: input.businessId, isActive: true },
    });

    if (existingOpen) {
      throw new DomainError(
        ERROR_CODES.SHIFT_ALREADY_OPEN,
        'A shift is already open. Close it before opening a new one.',
        400,
        { shiftId: existingOpen.id, openedAt: existingOpen.openedAt }
      );
    }

    // Get next shift number
    const lastShift = await tx.cashRegisterShift.findFirst({
      where: { businessId: input.businessId },
      orderBy: { shiftNumber: 'desc' },
      select: { shiftNumber: true },
    });
    const nextNumber = (lastShift?.shiftNumber ?? 0) + 1;

    const shift = await tx.cashRegisterShift.create({
      data: {
        businessId: input.businessId,
        userId: input.userId,
        shiftNumber: nextNumber,
        openingCash: input.openingCash,
        isActive: true,
        notes: input.notes,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: input.businessId,
        userId: input.userId,
        action: 'OPEN_SHIFT',
        entityType: 'CashRegisterShift',
        entityId: shift.id,
        details: { shiftNumber: nextNumber, openingCash: input.openingCash },
      },
    });

    return shift;
  });
}

// ============================================================================
// GET SHIFT SUMMARY
// ============================================================================

/**
 * Calculate a complete shift summary with all financial metrics.
 */
export async function getShiftSummary(
  shiftId: string,
  businessId: string
): Promise<ShiftSummary> {
  const shift = await db.cashRegisterShift.findFirst({
    where: { id: shiftId, businessId },
  });

  if (!shift) {
    throw new DomainError(ERROR_CODES.SHIFT_NOT_OPEN, 'Shift not found', 404);
  }

  // Get all sales in this shift
  const sales = await db.sale.findMany({
    where: {
      shiftId,
      businessId,
      status: 'COMPLETED',
    },
    include: { payments: true, returns: { select: { refundAmount: true, refundMethod: true } } },
  });

  let totalSalesCash = new Decimal(0);
  let totalSalesUPI = new Decimal(0);
  let totalSalesOther = new Decimal(0);
  let totalRefunds = new Decimal(0);

  for (const sale of sales) {
    // Sum payments by method
    for (const payment of sale.payments) {
      if (payment.method === 'CASH') {
        totalSalesCash = totalSalesCash.plus(payment.amount);
      } else if (payment.method === 'UPI') {
        totalSalesUPI = totalSalesUPI.plus(payment.amount);
      } else {
        totalSalesOther = totalSalesOther.plus(payment.amount);
      }
    }

    // Sum refunds
    for (const ret of sale.returns) {
      if (ret.refundMethod === 'CASH') {
        totalRefunds = totalRefunds.plus(ret.refundAmount);
      }
    }
  }

  // Get expenses in shift time range
  const expenses = await db.expense.findMany({
    where: {
      businessId,
      isActive: true,
      date: {
        gte: shift.openedAt,
        ...(shift.closedAt ? { lte: shift.closedAt } : {}),
      },
    },
  });

  // Filter expenses within shift period
  const shiftExpenses = expenses.filter((e) => {
    const expDate = new Date(e.date);
    return expDate >= shift.openedAt && (!shift.closedAt || expDate <= shift.closedAt);
  });
  const totalExpenses = shiftExpenses.reduce(
    (sum, e) => sum.plus(e.amount),
    new Decimal(0)
  );

  const totalSales = totalSalesCash.plus(totalSalesUPI).plus(totalSalesOther);

  // Expected cash = opening + cash sales - cash refunds - cash expenses
  const cashExpenses = shiftExpenses
    .filter((e) => e.paymentMethod === 'CASH')
    .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));

  const expectedCash = new Decimal(shift.openingCash)
    .plus(totalSalesCash)
    .minus(totalRefunds)
    .minus(cashExpenses);

  return {
    shift,
    totalSalesCash: totalSalesCash.toNumber(),
    totalSalesUPI: totalSalesUPI.toNumber(),
    totalSalesOther: totalSalesOther.toNumber(),
    totalSales: totalSales.toNumber(),
    totalExpenses: totalExpenses.toNumber(),
    totalRefunds: totalRefunds.toNumber(),
    expectedCash: expectedCash.toNumber(),
    actualCash: shift.closingCash ? Number(shift.closingCash) : undefined,
    difference: shift.cashDifference ? Number(shift.cashDifference) : undefined,
    saleCount: sales.length,
  };
}

// ============================================================================
// CLOSE SHIFT
// ============================================================================

/**
 * Close an open shift with actual cash count.
 * Records the difference between expected and actual cash.
 */
export async function closeShift(input: CloseShiftInput): Promise<ShiftSummary> {
  return db.$transaction(async (tx) => {
    const shift = await tx.cashRegisterShift.findFirst({
      where: { id: input.shiftId, businessId: input.businessId, isActive: true },
    });

    if (!shift) {
      throw new DomainError(
        ERROR_CODES.SHIFT_NOT_OPEN,
        'No open shift found with this ID',
        404
      );
    }

    // Calculate summary first
    const summary = await getShiftSummary(input.shiftId, input.businessId);
    const difference = new Decimal(input.actualCash).minus(summary.expectedCash);

    // Close the shift
    const closedShift = await tx.cashRegisterShift.update({
      where: { id: input.shiftId },
      data: {
        closedAt: new Date(),
        closingCash: input.actualCash,
        expectedCash: summary.expectedCash,
        cashDifference: difference.toNumber(),
        totalSales: summary.totalSales,
        totalExpenses: summary.totalExpenses,
        totalRefunds: summary.totalRefunds,
        isActive: false,
        notes: input.notes,
      },
    });

    await tx.auditLog.create({
      data: {
        businessId: input.businessId,
        userId: input.userId,
        action: 'CLOSE_SHIFT',
        entityType: 'CashRegisterShift',
        entityId: input.shiftId,
        details: {
          shiftNumber: shift.shiftNumber,
          openingCash: Number(shift.openingCash),
          expectedCash: summary.expectedCash,
          actualCash: input.actualCash,
          difference: difference.toNumber(),
          totalSales: summary.totalSales,
          saleCount: summary.saleCount,
        },
      },
    });

    return {
      ...summary,
      shift: closedShift,
      actualCash: input.actualCash,
      difference: difference.toNumber(),
    };
  });
}

// ============================================================================
// GET CURRENT OPEN SHIFT
// ============================================================================

export async function getCurrentShift(
  businessId: string
): Promise<CashRegisterShift | null> {
  return db.cashRegisterShift.findFirst({
    where: { businessId, isActive: true },
    orderBy: { openedAt: 'desc' },
  });
}
